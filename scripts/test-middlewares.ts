// Test de caracterización de middlewares (spec §22 — arquitectura de
// middlewares). Captura el comportamiento REAL de la app antes y después del
// refactor `global/route/error` para demostrar que es idéntico (refactor puro).
//
// Estrategia:
// - `src/app.ts` hace `listen` al importarse, así que NO se importa: se
//   levanta como proceso hijo (`node --import tsx src/app.ts`) sobre un puerto
//   libre y una DB temporal (`DB_PATH` en os.tmpdir(), NUNCA dev.db).
// - El seed corre contra la MISMA DB temporal para tener productos reales.
// - Los estáticos se sirven desde `dist/public` (spec §14): el test exige que
//   el build previo exista (`npm run build`); en CI el job ya lo ejecuta.
// - La cookie de sesión se maneja a mano con `Set-Cookie` + header `Cookie`.
//
// Uso:
//   npm run test:middlewares
//   MIDDLEWARE_SNAPSHOT=/ruta/baseline.json npm run test:middlewares
//     → además de assertar, escribe las observaciones (baseline) en el JSON.
//
// Salida: exit code 0 si todo pasa, 1 si algo falla. Nunca toca `dev.db`.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Configuración ───────────────────────────────────────────────────────────
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `middlewares-test-${process.pid}-${Date.now()}.db`,
);
const SESSION_SECRET = "test-session-secret-middlewares";

// Guardia de seguridad: DB_PATH jamás debe resolver a dev.db.
const DEFAULT_DB = path.resolve(ROOT, "dev.db");
if (path.resolve(TEST_DB_PATH) === DEFAULT_DB) {
  console.error("ERROR: DB_PATH resuelve a dev.db — el test exige una DB temporal.");
  process.exit(1);
}

// ── Utilidades de aserción / reporte ────────────────────────────────────────
type Observation = Record<string, unknown>;
const observations: Observation = {};
let failures = 0;
let passes = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FALLIDA: ${message}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FALLIDA: ${message} (esperado=${JSON.stringify(expected)}, real=${JSON.stringify(actual)})`,
    );
  }
}

async function check(name: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
    passes += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Puerto libre y arranque del servidor ────────────────────────────────────
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("no se pudo resolver el puerto libre"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (res.status === 200) return;
    } catch {
      /* el server todavía no levantó */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`el servidor no respondió en ${timeoutMs}ms`);
}

function runSeed(): void {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts", "seed.ts")], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: TEST_DB_PATH, SESSION_SECRET },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error("Seed falló:", result.stdout, result.stderr);
    throw new Error(`el seed terminó con código ${result.status}`);
  }
}

// ── HTTP + manejo manual de cookies ─────────────────────────────────────────
interface HttpResult {
  status: number;
  headers: Headers;
  text: string;
  setCookies: string[];
}

async function request(
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: string; redirect?: RequestRedirect } = {},
): Promise<HttpResult> {
  const res = await fetch(url, {
    method,
    headers: options.headers,
    body: options.body,
    redirect: options.redirect ?? "manual",
  });
  const text = await res.text();
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { status: res.status, headers: res.headers, text, setCookies };
}

function sessionCookie(setCookies: string[]): string | undefined {
  const cookie = setCookies.find((c) => c.startsWith("connect.sid="));
  return cookie?.split(";")[0];
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ── M15/M16: errorHandler como unidad ───────────────────────────────────────
interface MockCalls {
  status: number[];
  json: unknown[];
  render: Array<{ view: string; options: Record<string, unknown> }>;
  send: unknown[];
}

function mockRes(
  renderImpl: (cb: (err: Error | null, html?: string) => void, calls: MockCalls) => void,
): { res: Record<string, unknown>; calls: MockCalls } {
  const calls: MockCalls = { status: [], json: [], render: [], send: [] };
  const res: Record<string, unknown> = {
    status(code: number) {
      calls.status.push(code);
      return res;
    },
    json(body: unknown) {
      calls.json.push(body);
      return res;
    },
    render(view: string, options: Record<string, unknown>, cb: (err: Error | null, html?: string) => void) {
      calls.render.push({ view, options });
      if (typeof cb === "function") renderImpl(cb, calls);
      return res;
    },
    send(body: unknown) {
      calls.send.push(body);
      return res;
    },
  };
  return { res, calls };
}

async function runErrorHandlerUnit(): Promise<void> {
  const { errorHandler } = await import(
    "../src/middlewares/error-handler.middleware.js"
  );

  await check("M15a: errorHandler renderiza 500 sin filtrar err.message al template", () => {
    const err = Object.assign(new Error("SECRETO-NO-DEBE-VERSE"), { status: 500 });
    const { res, calls } = mockRes((cb) => cb(null, "<html>500</html>"));
    errorHandler(err, { path: "/products/1" } as never, res as never, (() => {}) as never);
    observations.m15a = { status: calls.status, renders: calls.render, sent: calls.send };
    equal(calls.status[0], 500, "status del render 500");
    equal(calls.render[0]?.view, "templates/pages/500", "vista 500");
    assert(
      !("message" in (calls.render[0]?.options ?? {})),
      "el template no recibe err.message",
    );
    equal(calls.send[0], "<html>500</html>", "envía el HTML renderizado");
  });

  await check("M15b: fallback en texto plano anti-bucle si falla el render del 500", () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    const { res, calls } = mockRes((cb) => cb(new Error("falló el render")));
    errorHandler(err, { path: "/" } as never, res as never, (() => {}) as never);
    observations.m15b = { status: calls.status, sent: calls.send };
    equal(calls.send[0], "Internal server error", "fallback de texto plano");
  });

  await check("M15c: /api/* conserva err.message y status en JSON", () => {
    const err = Object.assign(new Error("Invalid id"), { status: 400 });
    const { res, calls } = mockRes(() => {});
    errorHandler(err, { path: "/api/cart/add/1" } as never, res as never, (() => {}) as never);
    observations.m15c = { status: calls.status, json: calls.json };
    equal(calls.status[0], 400, "status 400 en API");
    assert(
      JSON.stringify(calls.json[0]) === JSON.stringify({ error: "Invalid id" }),
      "JSON de error de API",
    );
  });

  await check("M16: errorHandler es de 4 argumentos y es el último handler", () => {
    observations.m16 = { arity: errorHandler.length };
    equal(errorHandler.length, 4, "firma (err, req, res, next)");
  });
}

// ── Suite contra la app real ────────────────────────────────────────────────
async function runHttpSuite(baseUrl: string): Promise<void> {
  // M1: GET / → 200 con contador 0 en el header (injectCartCount activo).
  await check("M1: GET / responde 200 con data-cart-count=0", async () => {
    const res = await request("GET", `${baseUrl}/`);
    observations.m1 = { status: res.status, hasZeroCounter: /data-cart-count="0"/.test(res.text) };
    equal(res.status, 200, "status 200");
    assert(/data-cart-count="0"/.test(res.text), "el header muestra el contador 0");
    assert(/<html/i.test(res.text), "respuesta HTML");
  });

  // M2: agregar al carrito y ver el contador reflejado con la misma cookie.
  await check("M2: POST /api/cart/add/1 y GET / con cookie → contador 1", async () => {
    const add = await request("POST", `${baseUrl}/api/cart/add/1`);
    const cookie = sessionCookie(add.setCookies);
    assert(cookie !== undefined, "la mutación emite cookie de sesión");
    const home = await request("GET", `${baseUrl}/`, { headers: { Cookie: cookie ?? "" } });
    observations.m2 = { addStatus: add.status, homeStatus: home.status, hasOneCounter: /data-cart-count="1"/.test(home.text) };
    equal(add.status, 200, "add 200");
    equal(home.status, 200, "home 200");
    assert(/data-cart-count="1"/.test(home.text), "el contador refleja la cantidad");
  });

  // M3: GET / sin mutar → no se emite cookie de sesión (saveUninitialized:false).
  await check("M3: GET / sin mutar el carrito no emite Set-Cookie", async () => {
    const res = await request("GET", `${baseUrl}/`);
    observations.m3 = { status: res.status, setCookies: res.setCookies };
    equal(res.status, 200, "status 200");
    equal(res.setCookies.length, 0, "sin Set-Cookie");
  });

  // M4: primera mutación → cookie httpOnly, SameSite=Lax, sin Max-Age/Expires.
  await check("M4: la cookie de sesión es HttpOnly, SameSite=Lax y sin Max-Age/Expires", async () => {
    const res = await request("POST", `${baseUrl}/api/cart/add/2`);
    const cookie = res.setCookies.find((c) => c.startsWith("connect.sid=")) ?? "";
    observations.m4 = { setCookies: res.setCookies };
    assert(cookie.length > 0, "emite connect.sid");
    assert(/HttpOnly/i.test(cookie), "HttpOnly presente");
    assert(/SameSite=Lax/i.test(cookie), "SameSite=Lax presente");
    assert(!/Max-Age/i.test(cookie), "sin Max-Age");
    assert(!/Expires/i.test(cookie), "sin Expires");
  });

  // M5: 404 HTML de páginas para rutas inexistentes.
  await check("M5: GET /ruta-que-no-existe → 404 con la vista 404", async () => {
    const res = await request("GET", `${baseUrl}/ruta-que-no-existe`);
    observations.m5 = { status: res.status, contentType: res.headers.get("content-type"), has404: /Página no encontrada/.test(res.text) };
    equal(res.status, 404, "status 404");
    assert((res.headers.get("content-type") ?? "").includes("text/html"), "HTML");
    assert(/Página no encontrada/.test(res.text), "contenido de pages/404");
  });

  // M6: 404 JSON para /api/*.
  await check("M6: GET /api/ruta-que-no-existe → 404 {error:'Not found'}", async () => {
    const res = await request("GET", `${baseUrl}/api/ruta-que-no-existe`);
    observations.m6 = { status: res.status, body: res.text };
    equal(res.status, 404, "status 404");
    assert(
      JSON.stringify(jsonOf(res.text)) === JSON.stringify({ error: "Not found" }),
      "JSON de not found",
    );
  });

  // M7: id no numérico en colección → 400.
  await check("M7: GET /api/products/abc → 400 {error:'Invalid id'}", async () => {
    const res = await request("GET", `${baseUrl}/api/products/abc`);
    observations.m7 = { status: res.status, body: res.text };
    equal(res.status, 400, "status 400");
    assert(
      JSON.stringify(jsonOf(res.text)) === JSON.stringify({ error: "Invalid id" }),
      "JSON de id inválido",
    );
  });

  // M8: variantes de id en colecciones. Baseline real: el guard legacy
  // responde 400 para TODA ruta de un segmento (bug documentado en SPEC §22).
  await check("M8: ids de colección (0/-1/1.5/5/999999) → 400 según baseline real", async () => {
    const observed: Record<string, unknown> = {};
    for (const id of ["0", "-1", "1.5", "5", "999999"]) {
      const res = await request("GET", `${baseUrl}/api/products/${id}`);
      observed[id] = { status: res.status, body: res.text };
      equal(res.status, 400, `/api/products/${id} → 400`);
      assert(
        JSON.stringify(jsonOf(res.text)) === JSON.stringify({ error: "Invalid id" }),
        `/api/products/${id} cuerpo`,
      );
    }
    observations.m8 = observed;
  });

  // M8b: categorías y órdenes comparten el mismo guard.
  await check("M8b: /api/categories/abc y /api/orders/abc → 400", async () => {
    const categories = await request("GET", `${baseUrl}/api/categories/abc`);
    const orders = await request("GET", `${baseUrl}/api/orders/abc`);
    observations.m8b = { categories: categories.status, orders: orders.status };
    equal(categories.status, 400, "categories 400");
    equal(orders.status, 400, "orders 400");
  });

  // M8c: límites del guard: multi-segmento y sin segmento NO se validan (404).
  await check("M8c: /api/products/5/extra y /api/products/ → 404 (fuera del guard)", async () => {
    const extra = await request("GET", `${baseUrl}/api/products/5/extra`);
    const bare = await request("GET", `${baseUrl}/api/products/`);
    observations.m8c = { extra: extra.status, bare: bare.status };
    equal(extra.status, 404, "multi-segmento 404");
    equal(bare.status, 404, "sin segmento 404");
  });

  // M9: id numérico inexistente. Baseline real: 400 (no hay controller de API
  // que resuelva el 404; ver hallazgo en SPEC §22).
  await check("M9: GET /api/products/999999 → 400 según baseline real", async () => {
    const res = await request("GET", `${baseUrl}/api/products/999999`);
    observations.m9 = { status: res.status, body: res.text };
    equal(res.status, 400, "status 400 (guard legacy)");
  });

  // M10: páginas /products/:id (validación por helper en el controller).
  await check("M10: /products/abc → 400 y /products/999999 → 404 (controller)", async () => {
    const invalid = await request("GET", `${baseUrl}/products/abc`);
    const missing = await request("GET", `${baseUrl}/products/999999`);
    const valid = await request("GET", `${baseUrl}/products/1`);
    observations.m10 = {
      invalid: { status: invalid.status, body: invalid.text },
      missing: { status: missing.status, has404: /Página no encontrada/.test(missing.text) },
      valid: valid.status,
    };
    equal(invalid.status, 400, "/products/abc 400");
    assert(/ID inválido/.test(invalid.text), "texto ID inválido");
    equal(missing.status, 404, "/products/999999 404");
    assert(/Página no encontrada/.test(missing.text), "vista 404");
    equal(valid.status, 200, "/products/1 200");
  });

  // M11: rutas del carrito con id inválido (validación en el controller).
  await check("M11: carrito con id inválido → 400 {error:'Invalid id'}", async () => {
    const add = await request("POST", `${baseUrl}/api/cart/add/abc`);
    const inc = await request("PATCH", `${baseUrl}/api/cart/increase/abc`);
    const rem = await request("DELETE", `${baseUrl}/api/cart/remove/abc`);
    observations.m11 = { add: add.status, inc: inc.status, rem: rem.status, addBody: add.text };
    for (const [name, res] of [["add", add], ["increase", inc], ["remove", rem]] as const) {
      equal(res.status, 400, `${name} 400`);
      assert(
        JSON.stringify(jsonOf(res.text)) === JSON.stringify({ error: "Invalid id" }),
        `${name} cuerpo`,
      );
    }
  });

  // M11b: el controller acepta ids numéricos "raros" (Number) que el guard de
  // colecciones rechazaría; se preserva esa diferencia.
  await check("M11b: POST /api/cart/add/+1 y /add/%201 → 200 (predicado Number)", async () => {
    const plus = await request("POST", `${baseUrl}/api/cart/add/+1`);
    const encoded = await request("POST", `${baseUrl}/api/cart/add/%201`);
    observations.m11b = { plus: plus.status, encoded: encoded.status };
    equal(plus.status, 200, "+1 → 200");
    equal(encoded.status, 200, "%201 → 200");
  });

  // M12: /api/cart/clear no se interpreta como :id.
  await check("M12: DELETE /api/cart/clear → 200 con carrito vacío", async () => {
    const res = await request("DELETE", `${baseUrl}/api/cart/clear`);
    const body = jsonOf(res.text) as { items?: unknown[]; total?: number; count?: number } | undefined;
    observations.m12 = { status: res.status, body: res.text };
    equal(res.status, 200, "status 200");
    assert(body !== undefined && Array.isArray(body.items) && body.items.length === 0, "items vacío");
  });

  // M13: Swagger ANTES del 404.
  await check("M13: GET /api-docs/ → 200 (Swagger, antes del 404)", async () => {
    const res = await request("GET", `${baseUrl}/api-docs/`);
    observations.m13 = { status: res.status, contentType: res.headers.get("content-type") };
    equal(res.status, 200, "status 200");
    assert(/swagger-ui/i.test(res.text) || /html/i.test(res.text), "HTML de Swagger UI");
  });

  // M14: estáticos servidos desde dist/public antes de la sesión.
  await check("M14: /favicon.ico y /js/cart.js → 200", async () => {
    const favicon = await request("GET", `${baseUrl}/favicon.ico`);
    const js = await request("GET", `${baseUrl}/js/cart.js`);
    observations.m14 = {
      favicon: favicon.status,
      js: js.status,
      jsSetCookie: js.setCookies,
    };
    equal(favicon.status, 200, "favicon 200");
    equal(js.status, 200, "js 200");
    equal(js.setCookies.length, 0, "estáticos fuera de la sesión (sin Set-Cookie)");
  });

  // M18: body parsers (urlencoded y JSON) siguen montados.
  await check("M18a: POST /checkout urlencoded incompleto → 400 con valores tipeados", async () => {
    const res = await request("POST", `${baseUrl}/checkout`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ firstName: "Ana" }).toString(),
    });
    observations.m18a = {
      status: res.status,
      hasValue: /value="Ana"/.test(res.text),
      hasError: /El apellido es obligatorio/.test(res.text),
    };
    equal(res.status, 400, "status 400");
    assert(/value="Ana"/.test(res.text), "re-render con el valor tipeado");
    assert(/El apellido es obligatorio/.test(res.text), "errores de validación");
  });

  await check("M18b: POST /checkout con body JSON → 400 (express.json montado)", async () => {
    const res = await request("POST", `${baseUrl}/checkout`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ana" }),
    });
    observations.m18b = { status: res.status, hasValue: /value="Ana"/.test(res.text) };
    equal(res.status, 400, "status 400");
    assert(/value="Ana"/.test(res.text), "el JSON se parseó y el valor se re-renderiza");
  });
}

// ── Runner ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("Test de caracterización de middlewares (spec §22)\n");

  // dist/public requerido por M14 (npm run build lo genera).
  const staticDir = path.join(ROOT, "dist", "public");
  if (!fs.existsSync(path.join(staticDir, "js", "cart.js"))) {
    console.error(
      `ERROR: falta ${path.relative(ROOT, staticDir)}. Corré \`npm run build\` antes de este test.`,
    );
    process.exit(1);
  }

  console.log("→ Preparando DB temporal y seed…");
  runSeed();

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`→ Levantando app (puerto ${port}, DB ${TEST_DB_PATH})…`);

  const server = spawn(process.execPath, ["--import", "tsx", path.join(ROOT, "src", "app.ts")], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: TEST_DB_PATH, PORT: String(port), SESSION_SECRET },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk: Buffer) => (serverLog += chunk.toString()));
  server.stderr.on("data", (chunk: Buffer) => (serverLog += chunk.toString()));

  try {
    await waitForServer(baseUrl);

    console.log("\nM15/M16 — errorHandler como unidad:");
    await runErrorHandlerUnit();

    console.log("\nM1–M18 — comportamiento HTTP real:");
    await runHttpSuite(baseUrl);
  } finally {
    server.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
    }
  }

  const snapshotPath = process.env.MIDDLEWARE_SNAPSHOT;
  if (snapshotPath) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(
      snapshotPath,
      `${JSON.stringify({ generatedBy: "scripts/test-middlewares.ts", observations }, null, 2)}\n`,
    );
    console.log(`\nBaseline escrito en ${snapshotPath}`);
  }

  console.log(`\nResultado: ${passes} OK, ${failures} fallidos`);
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
