// Test de caracterización de middlewares (spec §22 — arquitectura de
// middlewares, enmienda cookie httpOnly). Captura el comportamiento REAL de
// la app antes y después del refactor `global/route/error` para demostrar que
// es idéntico (refactor puro), y caracteriza los middlewares nuevos
// (attachUser M23, requirePageAuth M24, csrfOrigin M25) y el logout (M26).
//
// Estrategia:
// - `src/app.ts` hace `listen` al importarse, así que NO se importa: se
//   levanta como proceso hijo (`node --import tsx src/app.ts`) sobre un puerto
//   libre y una DB temporal (`DB_PATH` en os.tmpdir(), NUNCA dev.db).
// - El seed corre contra la MISMA DB temporal para tener productos reales.
// - Los estáticos se sirven desde `dist/public` (spec §14): el test exige que
//   el build previo exista (`npm run build`); en CI el job ya lo ejecuta.
// - La cookie de sesión se maneja a mano con `Set-Cookie` + header `Cookie`
//   (auth_token, enmienda cookie httpOnly; el header Authorization sigue
//   aceptado, C3).
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
const JWT_SECRET = "test-session-secret-middlewares";

// Guardia de seguridad: DB_PATH jamás debe resolver a dev.db.
const DEFAULT_DB = path.resolve(ROOT, "dev.db");
if (path.resolve(TEST_DB_PATH) === DEFAULT_DB) {
  console.error(
    "ERROR: DB_PATH resuelve a dev.db — el test exige una DB temporal.",
  );
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

async function check(
  name: string,
  run: () => Promise<void> | void,
): Promise<void> {
  try {
    await run();
    passes += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  ❌ ${name}`);
    console.log(
      `     ${error instanceof Error ? error.message : String(error)}`,
    );
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

async function waitForServer(
  baseUrl: string,
  timeoutMs = 30_000,
): Promise<void> {
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
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "seed.ts")],
    {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: TEST_DB_PATH, JWT_SECRET },
      encoding: "utf8",
    },
  );
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
  options: {
    headers?: Record<string, string>;
    body?: string;
    redirect?: RequestRedirect;
  } = {},
): Promise<HttpResult> {
  const res = await fetch(url, {
    method,
    headers: options.headers,
    body: options.body,
    redirect: options.redirect ?? "manual",
  });
  const text = await res.text();
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  return { status: res.status, headers: res.headers, text, setCookies };
}

function sessionCookie(setCookies: string[]): string | undefined {
  const cookie = setCookies.find((c) => c.startsWith("connect.sid="));
  return cookie?.split(";")[0];
}

/**
 * Extrae la cookie `auth_token` de los Set-Cookie (C1, enmienda httpOnly).
 *
 * @param {string[]} setCookies - Cabeceras Set-Cookie recibidas.
 * @returns {string | undefined} `auth_token=<jwt>` lista para el header Cookie.
 */
function authCookie(setCookies: string[]): string | undefined {
  const cookie = setCookies.find((c) => c.startsWith("auth_token="));
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
  renderImpl: (
    cb: (err: Error | null, html?: string) => void,
    calls: MockCalls,
  ) => void,
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
    render(
      view: string,
      options: Record<string, unknown>,
      cb: (err: Error | null, html?: string) => void,
    ) {
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
  const { errorHandler } =
    await import("../src/middlewares/error/error-handler.middleware.js");

  await check(
    "M15a: errorHandler renderiza 500 sin filtrar err.message al template",
    () => {
      const err = Object.assign(new Error("SECRETO-NO-DEBE-VERSE"), {
        status: 500,
      });
      const { res, calls } = mockRes((cb) => cb(null, "<html>500</html>"));
      errorHandler(
        err,
        { path: "/products/1" } as never,
        res as never,
        (() => {}) as never,
      );
      observations.m15a = {
        status: calls.status,
        renders: calls.render,
        sent: calls.send,
      };
      equal(calls.status[0], 500, "status del render 500");
      equal(calls.render[0]?.view, "templates/pages/500", "vista 500");
      assert(
        !("message" in (calls.render[0]?.options ?? {})),
        "el template no recibe err.message",
      );
      equal(calls.send[0], "<html>500</html>", "envía el HTML renderizado");
    },
  );

  await check(
    "M15b: fallback en texto plano anti-bucle si falla el render del 500",
    () => {
      const err = Object.assign(new Error("boom"), { status: 500 });
      const { res, calls } = mockRes((cb) => cb(new Error("falló el render")));
      errorHandler(
        err,
        { path: "/" } as never,
        res as never,
        (() => {}) as never,
      );
      observations.m15b = { status: calls.status, sent: calls.send };
      equal(calls.send[0], "Internal server error", "fallback de texto plano");
    },
  );

  await check("M15c: /api/* conserva err.message y status en JSON", () => {
    const err = Object.assign(new Error("Invalid id"), { status: 400 });
    const { res, calls } = mockRes(() => {});
    errorHandler(
      err,
      { path: "/api/cart/add/1" } as never,
      res as never,
      (() => {}) as never,
    );
    observations.m15c = { status: calls.status, json: calls.json };
    equal(calls.status[0], 400, "status 400 en API");
    assert(
      JSON.stringify(calls.json[0]) === JSON.stringify({ error: "Invalid id" }),
      "JSON de error de API",
    );
  });

  await check(
    "M16: errorHandler es de 4 argumentos y es el último handler",
    () => {
      observations.m16 = { arity: errorHandler.length };
      equal(errorHandler.length, 4, "firma (err, req, res, next)");
    },
  );
}

// ── Suite contra la app real ────────────────────────────────────────────────
async function runHttpSuite(baseUrl: string): Promise<void> {
  // Usuario real para los casos que necesitan JWT (spec §23, enmienda cookie
  // httpOnly): register ya no devuelve token en el body; la sesión viaja en la
  // cookie `auth_token` (C2). El header `Authorization` sigue aceptado (C3),
  // así que authHeaders lo cubre y authCookie la cookie.
  const email = `mw-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const register = await request("POST", `${baseUrl}/api/auth/register`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Mw",
      lastname: "Test",
      email,
      password: "Abcdef1!",
    }),
  });
  const authCookieValue = authCookie(register.setCookies) ?? "";
  const authHeaders = { Authorization: `Bearer ${authCookieValue.replace(/^auth_token=/, "")}` };
  const authCookieHeaders = { Cookie: authCookieValue };

  // M1: GET / → 200 con contador 0 en el header (el valor lo hidrata cart.js).
  await check("M1: GET / responde 200 con data-cart-count=0", async () => {
    const res = await request("GET", `${baseUrl}/`);
    observations.m1 = {
      status: res.status,
      hasZeroCounter: /data-cart-count="0"/.test(res.text),
    };
    equal(res.status, 200, "status 200");
    assert(
      /data-cart-count="0"/.test(res.text),
      "el header muestra el contador 0",
    );
    assert(/<html/i.test(res.text), "respuesta HTML");
  });

  // M2: el carrito exige JWT (spec §24); con token, el validateId responde 400.
  await check(
    "M2: /api/cart sin token → 401; con token el id inválido → 400",
    async () => {
      const noToken = await request("GET", `${baseUrl}/api/cart`);
      const invalidId = await request("POST", `${baseUrl}/api/cart/add/abc`, {
        headers: authHeaders,
      });
      observations.m2 = {
        noToken: noToken.status,
        invalidIdWithToken: invalidId.status,
      };
      equal(noToken.status, 401, "sin token 401");
      equal(invalidId.status, 400, "con token, id inválido 400 (validateId)");
    },
  );

  // M3: sin sesión no existe ninguna cookie de sesión.
  await check("M3: GET / no emite Set-Cookie (stateless)", async () => {
    const res = await request("GET", `${baseUrl}/`);
    observations.m3 = { status: res.status, setCookies: res.setCookies.length };
    equal(res.status, 200, "status 200");
    equal(res.setCookies.length, 0, "sin Set-Cookie");
  });

  // M4: helmet agrega cabeceras de seguridad (spec §24).
  await check("M4: helmet agrega CSP y nosniff", async () => {
    const res = await request("GET", `${baseUrl}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    observations.m4 = {
      xContentTypeOptions: res.headers.get("x-content-type-options"),
      hasCsp: csp.length > 0,
      cspHasUpgrade: /upgrade-insecure-requests/i.test(csp),
    };
    equal(res.headers.get("x-content-type-options"), "nosniff", "nosniff");
    assert(csp.includes("default-src 'self'"), "CSP con default-src 'self'");
    assert(
      !/upgrade-insecure-requests/i.test(csp),
      "sin upgrade-insecure-requests fuera de prod",
    );
  });

  // M5: 404 HTML de páginas para rutas inexistentes.
  await check(
    "M5: GET /ruta-que-no-existe → 404 con la vista 404",
    async () => {
      const res = await request("GET", `${baseUrl}/ruta-que-no-existe`);
      observations.m5 = {
        status: res.status,
        has404: /Página no encontrada/.test(res.text),
      };
      equal(res.status, 404, "status 404");
      assert(
        (res.headers.get("content-type") ?? "").includes("text/html"),
        "HTML",
      );
      assert(/Página no encontrada/.test(res.text), "contenido de pages/404");
    },
  );

  // M6: 404 JSON para /api/*.
  await check(
    "M6: GET /api/ruta-que-no-existe → 404 {error:'Not found'}",
    async () => {
      const res = await request("GET", `${baseUrl}/api/ruta-que-no-existe`);
      observations.m6 = { status: res.status, body: res.text };
      equal(res.status, 404, "status 404");
      assert(
        JSON.stringify(jsonOf(res.text)) ===
          JSON.stringify({ error: "Not found" }),
        "JSON de not found",
      );
    },
  );

  // M7: id no numérico en colección → 400.
  await check(
    "M7: GET /api/products/abc → 400 {error:'Invalid id'}",
    async () => {
      const res = await request("GET", `${baseUrl}/api/products/abc`);
      observations.m7 = { status: res.status, body: res.text };
      equal(res.status, 400, "status 400");
      assert(
        JSON.stringify(jsonOf(res.text)) ===
          JSON.stringify({ error: "Invalid id" }),
        "JSON de id inválido",
      );
    },
  );

  // M8: variantes de id en colecciones. Baseline real: el guard legacy de
  // products/categories responde 400 para TODA ruta de un segmento (§22.5).
  await check(
    "M8: ids de colección (0/-1/1.5/5/999999) → 400 (guard legacy)",
    async () => {
      const observed: Record<string, unknown> = {};
      for (const id of ["0", "-1", "1.5", "5", "999999"]) {
        const res = await request("GET", `${baseUrl}/api/products/${id}`);
        observed[id] = { status: res.status, body: res.text };
        equal(res.status, 400, `/api/products/${id} → 400`);
        assert(
          JSON.stringify(jsonOf(res.text)) ===
            JSON.stringify({ error: "Invalid id" }),
          `/api/products/${id} cuerpo`,
        );
      }
      observations.m8 = observed;
    },
  );

  // M8b: categories (guard legacy) y orders (validateId por ruta) → 400.
  await check("M8b: /api/categories/abc y /api/orders/abc → 400", async () => {
    const categories = await request("GET", `${baseUrl}/api/categories/abc`);
    const orders = await request("GET", `${baseUrl}/api/orders/abc`);
    observations.m8b = { categories: categories.status, orders: orders.status };
    equal(categories.status, 400, "categories 400");
    equal(orders.status, 400, "orders 400");
  });

  // M8c: límites del guard: multi-segmento y sin segmento NO se validan (404).
  await check(
    "M8c: /api/products/5/extra y /api/products/ → 404 (fuera del guard)",
    async () => {
      const extra = await request("GET", `${baseUrl}/api/products/5/extra`);
      const bare = await request("GET", `${baseUrl}/api/products/`);
      observations.m8c = { extra: extra.status, bare: bare.status };
      equal(extra.status, 404, "multi-segmento 404");
      equal(bare.status, 404, "sin segmento 404");
    },
  );

  // M9: id numérico inexistente en products → 400 (guard legacy, §22.5).
  await check("M9: GET /api/products/999999 → 400 (guard legacy)", async () => {
    const res = await request("GET", `${baseUrl}/api/products/999999`);
    observations.m9 = { status: res.status, body: res.text };
    equal(res.status, 400, "status 400 (guard legacy)");
  });

  // M10: páginas /products/:id (validación por helper en el controller).
  await check(
    "M10: /products/abc → 400 y /products/999999 → 404 (controller)",
    async () => {
      const invalid = await request("GET", `${baseUrl}/products/abc`);
      const missing = await request("GET", `${baseUrl}/products/999999`);
      const valid = await request("GET", `${baseUrl}/products/1`);
      observations.m10 = {
        invalid: { status: invalid.status },
        missing: {
          status: missing.status,
          has404: /Página no encontrada/.test(missing.text),
        },
        valid: valid.status,
      };
      equal(invalid.status, 400, "/products/abc 400");
      assert(/ID inválido/.test(invalid.text), "texto ID inválido");
      equal(missing.status, 404, "/products/999999 404");
      assert(/Página no encontrada/.test(missing.text), "vista 404");
      equal(valid.status, 200, "/products/1 200");
    },
  );

  // M11: carrito con token e id inválido → 400; sin token → 401.
  await check(
    "M11: carrito: sin token 401, con token id inválido 400",
    async () => {
      const noToken = await request("POST", `${baseUrl}/api/cart/add/abc`);
      const withToken = await request("POST", `${baseUrl}/api/cart/add/abc`, {
        headers: authHeaders,
      });
      observations.m11 = {
        noToken: noToken.status,
        withToken: withToken.status,
        body: withToken.text,
      };
      equal(noToken.status, 401, "sin token 401");
      equal(withToken.status, 400, "con token 400");
      assert(
        JSON.stringify(jsonOf(withToken.text)) ===
          JSON.stringify({ error: "Invalid id" }),
        "cuerpo",
      );
    },
  );

  // M11b: token manipulado → 401 (por cookie y por header, C3).
  await check("M11b: token manipulado → 401 (cookie y header)", async () => {
    const viaCookie = await request("GET", `${baseUrl}/api/auth/me`, {
      headers: { Cookie: `${authCookieValue}x` },
    });
    const viaHeader = await request("GET", `${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authCookieValue.replace(/^auth_token=/, "")}x` },
    });
    observations.m11b = {
      viaCookie: viaCookie.status,
      viaHeader: viaHeader.status,
      body: viaCookie.text,
    };
    equal(viaCookie.status, 401, "cookie manipulada 401");
    equal(viaHeader.status, 401, "header manipulado 401");
  });

  // M12: DELETE /api/cart/clear sin token → 401 (no se interpreta como :id).
  await check("M12: DELETE /api/cart/clear sin token → 401", async () => {
    const res = await request("DELETE", `${baseUrl}/api/cart/clear`);
    observations.m12 = { status: res.status };
    equal(res.status, 401, "401");
  });

  // M13: Swagger ANTES del 404.
  await check(
    "M13: GET /api-docs/ → 200 (Swagger, antes del 404)",
    async () => {
      const res = await request("GET", `${baseUrl}/api-docs/`);
      observations.m13 = {
        status: res.status,
        contentType: res.headers.get("content-type"),
      };
      equal(res.status, 200, "status 200");
      assert(
        /swagger-ui/i.test(res.text) || /html/i.test(res.text),
        "HTML de Swagger UI",
      );
    },
  );

  // M14: estáticos servidos desde dist/public.
  await check("M14: /favicon.ico y /js/cart.js → 200", async () => {
    const favicon = await request("GET", `${baseUrl}/favicon.ico`);
    const js = await request("GET", `${baseUrl}/js/cart.js`);
    observations.m14 = { favicon: favicon.status, js: js.status };
    equal(favicon.status, 200, "favicon 200");
    equal(js.status, 200, "js 200");
    equal(js.setCookies.length, 0, "estáticos sin Set-Cookie");
  });

  // M18: body parsers (urlencoded y JSON) siguen montados (vía /api/auth/register).
  await check("M18a: POST urlencoded a /api/auth/register → 201", async () => {
    const res = await request("POST", `${baseUrl}/api/auth/register`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: "Url",
        lastname: "Encoded",
        email: `mw-url-${Date.now()}@example.com`,
        password: "Abcdef1!",
      }).toString(),
    });
    observations.m18a = { status: res.status };
    equal(res.status, 201, "201");
  });

  await check("M18b: POST JSON a /api/auth/register → 201", async () => {
    const res = await request("POST", `${baseUrl}/api/auth/register`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Json",
        lastname: "Body",
        email: `mw-json-${Date.now()}@example.com`,
        password: "Abcdef1!",
      }),
    });
    observations.m18b = { status: res.status };
    equal(res.status, 201, "201");
  });

  // M19: authenticate con token válido.
  await check("M19: token válido → /api/auth/me 200", async () => {
    const res = await request("GET", `${baseUrl}/api/auth/me`, {
      headers: authHeaders,
    });
    observations.m19 = { status: res.status, hasUser: /"user"/.test(res.text) };
    equal(res.status, 200, "200");
    assert(/"user"/.test(res.text), "devuelve user");
  });

  // M20: las rutas del carrito autentican ANTES de validar el id.
  await check(
    "M20: /api/cart/* sin token → 401 ANTES de validar el id",
    async () => {
      const res = await request("POST", `${baseUrl}/api/cart/add/abc`);
      observations.m20 = { status: res.status, body: res.text };
      equal(res.status, 401, "401 (no 400)");
    },
  );

  // M21: Swagger relaja su CSP solo en /api-docs.
  await check("M21: /api-docs/ usa CSP relajado (inline)", async () => {
    const res = await request("GET", `${baseUrl}/api-docs/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    observations.m21 = {
      status: res.status,
      hasInline: /unsafe-inline/.test(csp),
    };
    equal(res.status, 200, "200");
    assert(/unsafe-inline/.test(csp), "CSP permite inline en Swagger");
  });

  // M22: helmet también en assets estáticos.
  await check(
    "M22: cabeceras de helmet también en assets estáticos",
    async () => {
      const res = await request("GET", `${baseUrl}/js/cart.js`);
      observations.m22 = {
        status: res.status,
        nosniff: res.headers.get("x-content-type-options"),
      };
      equal(res.status, 200, "200");
      equal(res.headers.get("x-content-type-options"), "nosniff", "nosniff");
    },
  );

  // M23: attachUser (global, blando) — nunca falla y deja res.locals.user.
  await check(
    "M23: attachUser — data-logged-in y nombre según cookie; inválida no 500",
    async () => {
      const anon = await request("GET", `${baseUrl}/`);
      observations.m23Anon = {
        status: anon.status,
        loggedIn: /data-logged-in="false"/.test(anon.text),
        guest: /Invitado/.test(anon.text),
      };
      equal(anon.status, 200, "anónimo 200");
      assert(/data-logged-in="false"/.test(anon.text), 'anónimo data-logged-in="false"');
      assert(/Invitado/.test(anon.text), "anónimo muestra Invitado");

      const withSession = await request("GET", `${baseUrl}/`, {
        headers: authCookieHeaders,
      });
      observations.m23WithSession = {
        status: withSession.status,
        loggedIn: /data-logged-in="true"/.test(withSession.text),
        name: /Mw Test/.test(withSession.text),
      };
      equal(withSession.status, 200, "con cookie 200");
      assert(/data-logged-in="true"/.test(withSession.text), 'sesión data-logged-in="true"');
      assert(/Mw Test/.test(withSession.text), "header renderiza el nombre");

      // Cookie inválida: attachUser nunca falla (deja null y sigue).
      const invalid = await request("GET", `${baseUrl}/`, {
        headers: { Cookie: "auth_token=no-es-un-jwt" },
      });
      observations.m23Invalid = { status: invalid.status };
      equal(invalid.status, 200, "cookie inválida 200 (no 500)");
    },
  );

  // M24: requirePageAuth — 302 del servidor para /cart y /checkout.
  await check(
    "M24: /cart y /checkout sin cookie → 302 a /login?next=…; con cookie → 200",
    async () => {
      const cartAnon = await request("GET", `${baseUrl}/cart`);
      observations.m24CartAnon = {
        status: cartAnon.status,
        location: cartAnon.headers.get("location"),
      };
      equal(cartAnon.status, 302, "/cart sin sesión 302");
      assert(
        (cartAnon.headers.get("location") ?? "") === "/login?next=%2Fcart",
        `location /login?next=%2Fcart (real ${cartAnon.headers.get("location")})`,
      );

      const checkoutAnon = await request("GET", `${baseUrl}/checkout`);
      equal(checkoutAnon.status, 302, "/checkout sin sesión 302");
      assert(
        (checkoutAnon.headers.get("location") ?? "") === "/login?next=%2Fcheckout",
        "location /login?next=%2Fcheckout",
      );

      const cartWith = await request("GET", `${baseUrl}/cart`, {
        headers: authCookieHeaders,
      });
      const checkoutWith = await request("GET", `${baseUrl}/checkout`, {
        headers: authCookieHeaders,
      });
      observations.m24With = {
        cart: cartWith.status,
        checkout: checkoutWith.status,
      };
      equal(cartWith.status, 200, "/cart con cookie 200");
      equal(checkoutWith.status, 200, "/checkout con cookie 200");

      // La confirmación sigue pública (sin sesión no redirige; 404 por token).
      const confirmAnon = await request(
        "GET",
        `${baseUrl}/checkout/confirmation/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      );
      equal(confirmAnon.status, 404, "confirmación pública (404 por token inválido, no 302)");
    },
  );

  // M25: csrfOrigin — mutaciones con origen ajeno → 403; GET nunca se bloquea.
  await check(
    "M25: csrfOrigin — Origin ajeno 403, cross-site 403, sin Origin pasa, GET 200",
    async () => {
      const evil = await request("DELETE", `${baseUrl}/api/cart/clear`, {
        headers: { ...authCookieHeaders, Origin: "https://evil.example" },
      });
      observations.m25Evil = { status: evil.status, body: evil.text };
      equal(evil.status, 403, "Origin ajeno 403");
      assert(
        JSON.stringify(jsonOf(evil.text)) ===
          JSON.stringify({ error: "Origen no permitido" }),
        "mensaje de origen",
      );

      const cross = await request("DELETE", `${baseUrl}/api/cart/clear`, {
        headers: { ...authCookieHeaders, "Sec-Fetch-Site": "cross-site" },
      });
      observations.m25Cross = { status: cross.status };
      equal(cross.status, 403, "Sec-Fetch-Site cross-site 403");

      // Sin Origin ni Sec-Fetch-Site (curl/tests) → pasa a authenticate → 200.
      const curl = await request("DELETE", `${baseUrl}/api/cart/clear`, {
        headers: authCookieHeaders,
      });
      observations.m25Curl = { status: curl.status };
      equal(curl.status, 200, "sin Origin 200 (cliente no navegador)");

      const getEvil = await request("GET", `${baseUrl}/`, {
        headers: { Origin: "https://evil.example" },
      });
      observations.m25Get = { status: getEvil.status };
      equal(getEvil.status, 200, "GET con Origin ajeno 200 (C4)");
    },
  );

  // M26: contrato de montaje §22.4 — cookieParser corre antes de json y
  // attachUser antes de las rutas (verificado por M23); /api-docs antes del
  // 404 (M13); logout responde 204 y borra la cookie (C9).
  await check(
    "M26: logout → 204 y Set-Cookie borra auth_token (C9)",
    async () => {
      const out = await request("POST", `${baseUrl}/api/auth/logout`, {
        headers: authCookieHeaders,
      });
      observations.m26 = {
        status: out.status,
        setCookies: out.setCookies,
      };
      equal(out.status, 204, "logout 204");
      const cleared = out.setCookies.find((c) => c.startsWith("auth_token="));
      assert(cleared !== undefined, "Set-Cookie al borrar");
      assert(
        /Max-Age=0/i.test(cleared) || /Expires=Thu, 01 Jan 1970/i.test(cleared),
        "cookie borrada",
      );
    },
  );
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

  const server = spawn(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "src", "app.ts")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DB_PATH: TEST_DB_PATH,
        PORT: String(port),
        JWT_SECRET,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverLog = "";
  server.stdout.on("data", (chunk: Buffer) => (serverLog += chunk.toString()));
  server.stderr.on("data", (chunk: Buffer) => (serverLog += chunk.toString()));

  try {
    await waitForServer(baseUrl);

    console.log("\nM15/M16 — errorHandler como unidad:");
    await runErrorHandlerUnit();

    console.log("\nM1–M26 — comportamiento HTTP real:");
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
