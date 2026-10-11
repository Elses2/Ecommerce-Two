// Test de autenticación JWT con cookie httpOnly (spec §23, enmienda cookie
// httpOnly): casos A1–A8 adaptados + A9–A11 nuevos contra una DB temporal.
// Runner: tsx (igual que test-checkout / test-middlewares). La DB NUNCA es
// dev.db: se genera una ruta temporal en os.tmpdir() y se pasa por DB_PATH al
// proceso hijo (`node --import tsx src/app.ts`), que arranca en un puerto libre.
// Salida: exit code 0 si todo pasa, 1 si algo falla.
//
// A1 register OK (cookie, sin token en body) · A2 email repetido · A3
// validación · A4 login OK (cookie) · A5 credenciales inválidas · A6 /me
// (header y cookie, ausente/expirado/manipulado/otro algoritmo) · A7 authorize
// por rol · A8 ownership por cookie · A9 atributos de la cookie (HttpOnly /
// SameSite=Lax / Path / Secure con COOKIE_SECURE=true) y logout · A10 CSRF
// por origen · A11 COOKIE_SECURE=true (segunda instancia) agrega `Secure`.
import { spawn } from "node:child_process";
import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `auth-test-${process.pid}-${Date.now()}.db`,
);
const JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";

const DEFAULT_DB = path.resolve(ROOT, "dev.db");
if (path.resolve(TEST_DB_PATH) === DEFAULT_DB) {
  console.error(
    "ERROR: DB_PATH resuelve a dev.db — el test exige una DB temporal.",
  );
  process.exit(1);
}

let failures = 0;
let passes = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`ASSERTION FALLIDA: ${message}`);
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
      const res = await fetch(`${baseUrl}/api/ruta-inexistente`, {
        redirect: "manual",
      });
      if (res.status > 0) return;
    } catch {
      /* todavía no levantó */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`el servidor no respondió en ${timeoutMs}ms`);
}

interface HttpResult {
  status: number;
  text: string;
  json: Record<string, unknown>;
  setCookies: string[];
}

async function api(
  baseUrl: string,
  method: string,
  pathname: string,
  options: {
    body?: unknown;
    token?: string;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* respuesta no JSON */
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  return { status: res.status, text, json, setCookies };
}

/**
 * Extrae la cookie `auth_token` de los Set-Cookie de una respuesta (C1).
 *
 * @param {string[]} setCookies - Cabeceras Set-Cookie recibidas.
 * @returns {string | undefined} `auth_token=<jwt>` lista para el header Cookie.
 */
function authCookie(setCookies: string[]): string | undefined {
  const cookie = setCookies.find((c) => c.startsWith("auth_token="));
  return cookie?.split(";")[0];
}

/**
 * Extrae el JWT de la cookie `auth_token` (para los casos que lo manipulan).
 *
 * @param {string} cookie - Cookie `auth_token=<jwt>`.
 * @returns {string} El JWT.
 */
function jwtFromCookie(cookie: string | undefined): string {
  return (cookie ?? "").replace(/^auth_token=/, "");
}

function uniqueEmail(): string {
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function runSuite(baseUrl: string): Promise<void> {
  const email = uniqueEmail();
  const password = "Abcdef1!";
  let cookie = ""; // auth_token=<jwt> (spec §23.1, enmienda cookie httpOnly)
  let userAId = 0;

  await check(
    "A1: register OK setea cookie httpOnly, sin token en el body y sin password_hash",
    async () => {
      const res = await api(baseUrl, "POST", "/api/auth/register", {
        body: { name: "Ana", lastname: "Pérez", email, password },
      });
      assert(res.status === 201, `status 201 (real ${res.status})`);
      assert(
        res.json.token === undefined,
        "el body NO contiene token (C2)",
      );
      assert(!res.text.includes("password_hash"), "no filtra password_hash");
      const user = res.json.user as Record<string, unknown>;
      assert(user.email === email, "email correcto");
      assert(user.role === "customer", "rol customer");
      const set = res.setCookies.find((c) => c.startsWith("auth_token="));
      assert(set !== undefined, "Set-Cookie auth_token presente");
      assert(/HttpOnly/i.test(set), "cookie httpOnly");
      assert(/SameSite=Lax/i.test(set), "cookie SameSite=Lax (C1)");
      assert(/Path=/i.test(set), "cookie Path=/ (C1)");
      cookie = authCookie(res.setCookies) ?? "";
      assert(cookie.length > 0, "cookie extraída");
      userAId = Number(user.id);
    },
  );

  await check(
    "A2: email repetido → 409, incluida la carrera (Promise.all)",
    async () => {
      const dup = await api(baseUrl, "POST", "/api/auth/register", {
        body: { name: "Ana", lastname: "Pérez", email, password },
      });
      assert(dup.status === 409, `secuencial 409 (real ${dup.status})`);

      const raceEmail = uniqueEmail();
      const results = await Promise.all(
        [0, 1].map(() =>
          api(baseUrl, "POST", "/api/auth/register", {
            body: {
              name: "Race",
              lastname: "User",
              email: raceEmail,
              password,
            },
          }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      assert(
        JSON.stringify(statuses) === JSON.stringify([201, 409]),
        `carrera: un 201 y un 409 (real ${statuses.join(",")})`,
      );
    },
  );

  await check(
    "A3: validación → 400 con mensajes en español (min 8 / máx 72)",
    async () => {
      const res = await api(baseUrl, "POST", "/api/auth/register", {
        body: { name: "", lastname: "", email: "no-es-email", password: "123" },
      });
      assert(res.status === 400, `status 400 (real ${res.status})`);
      const errors = res.json.errors as string[];
      assert(Array.isArray(errors) && errors.length >= 4, "varios errores");
      assert(
        errors.some((e) => e.includes("contraseña")),
        "error de contraseña",
      );

      const long = await api(baseUrl, "POST", "/api/auth/register", {
        body: {
          name: "A",
          lastname: "B",
          email: uniqueEmail(),
          password: "a".repeat(73),
        },
      });
      assert(long.status === 400, `password > 72 → 400 (real ${long.status})`);
      assert(
        (long.json.errors as string[]).some((e) => e.includes("72")),
        "menciona el máximo de 72",
      );
    },
  );

  await check(
    "A4: login OK setea cookie y no devuelve token en el body",
    async () => {
      const res = await api(baseUrl, "POST", "/api/auth/login", {
        body: { email, password },
      });
      assert(res.status === 200, `status 200 (real ${res.status})`);
      assert(res.json.token === undefined, "el body NO contiene token (C2)");
      const set = res.setCookies.find((c) => c.startsWith("auth_token="));
      assert(set !== undefined, "Set-Cookie auth_token presente");
      assert(/HttpOnly/i.test(set), "cookie httpOnly en login");
    },
  );

  await check(
    "A5: login con clave mala y email inexistente → mismo 401",
    async () => {
      const bad = await api(baseUrl, "POST", "/api/auth/login", {
        body: { email, password: "wrong-pass" },
      });
      const unknown = await api(baseUrl, "POST", "/api/auth/login", {
        body: { email: uniqueEmail(), password: "wrong-pass" },
      });
      assert(bad.status === 401, `clave mala 401 (real ${bad.status})`);
      assert(
        unknown.status === 401,
        `email inexistente 401 (real ${unknown.status})`,
      );
      assert(
        bad.text === unknown.text,
        "mismo cuerpo de error (no enumera usuarios)",
      );
    },
  );

  await check(
    "A6: /me con cookie/header: válido, ausente, expirado, manipulado y otro algoritmo",
    async () => {
      // C3: el header Authorization sigue aceptado.
      const valid = await api(baseUrl, "GET", "/api/auth/me", {
        cookie,
      });
      assert(valid.status === 200, `cookie válida 200 (real ${valid.status})`);
      assert(
        (valid.json.user as Record<string, unknown>).email === email,
        "usuario correcto",
      );

      const absent = await api(baseUrl, "GET", "/api/auth/me");
      assert(absent.status === 401, `ausente 401 (real ${absent.status})`);

      // La cookie también funciona vía header (C3).
      const viaHeader = await api(baseUrl, "GET", "/api/auth/me", {
        token: jwtFromCookie(cookie),
      });
      assert(
        viaHeader.status === 200,
        `header Bearer 200 (real ${viaHeader.status}) — C3`,
      );

      const manipulated = await api(baseUrl, "GET", "/api/auth/me", {
        cookie: `auth_token=${jwtFromCookie(cookie)}x`,
      });
      assert(
        manipulated.status === 401,
        `manipulado 401 (real ${manipulated.status})`,
      );

      const expired = jwt.sign({ role: "customer" }, JWT_SECRET, {
        subject: "1",
        expiresIn: "-1s",
        algorithm: "HS256",
      });
      const expiredRes = await api(baseUrl, "GET", "/api/auth/me", {
        cookie: `auth_token=${expired}`,
      });
      assert(
        expiredRes.status === 401,
        `expirado 401 (real ${expiredRes.status})`,
      );

      const otherAlg = jwt.sign({ role: "admin" }, JWT_SECRET, {
        subject: "1",
        expiresIn: "1h",
        algorithm: "HS512",
      });
      const algRes = await api(baseUrl, "GET", "/api/auth/me", {
        cookie: `auth_token=${otherAlg}`,
      });
      assert(
        algRes.status === 401,
        `HS512 rechazado 401 (real ${algRes.status})`,
      );
    },
  );

  await check(
    "A7: authorize por rol (unit) → 403 customer / pasa admin / 401 sin usuario",
    async () => {
      const { authorize } =
        await import("../src/middlewares/route/authorize.middleware.js");
      const makeRes = () => {
        const calls = { status: [] as number[], json: [] as unknown[] };
        const res = {
          status(code: number) {
            calls.status.push(code);
            return res;
          },
          json(body: unknown) {
            calls.json.push(body);
            return res;
          },
        };
        return { res, calls };
      };
      let nextCalls = 0;
      const run = (
        handler: (r: never, s: never, n: never) => void,
        user: unknown,
      ) => {
        const { res, calls } = makeRes();
        handler(
          { user } as never,
          res as never,
          (() => {
            nextCalls += 1;
          }) as never,
        );
        return calls;
      };
      const guard = authorize("admin") as unknown as (
        r: never,
        s: never,
        n: never,
      ) => void;
      const customer = run(guard, { id: 1, role: "customer" });
      assert(
        customer.status[0] === 403,
        `customer 403 (real ${customer.status[0]})`,
      );
      const anonymous = run(guard, undefined);
      assert(
        anonymous.status[0] === 401,
        `sin usuario 401 (real ${anonymous.status[0]})`,
      );
      const before = nextCalls;
      run(guard, { id: 1, role: "admin" });
      assert(nextCalls === before + 1, "admin pasa al siguiente middleware");
    },
  );

  await check(
    "A8: ownership de órdenes (aislamiento + detalle ajeno 404)",
    async () => {
      const emailB = uniqueEmail();
      const registerB = await api(baseUrl, "POST", "/api/auth/register", {
        body: { name: "Bea", lastname: "Gómez", email: emailB, password },
      });
      assert(
        registerB.status === 201,
        `registro B 201 (real ${registerB.status})`,
      );
      const cookieB = authCookie(registerB.setCookies) ?? "";

      // Las órdenes se insertan directo en la DB temporal: el checkout
      // autenticado (que crea órdenes para un usuario) llega en el PR 3.
      const db = new BetterSqlite3(TEST_DB_PATH);
      let orderAId = 0;
      try {
        const info = db
          .prepare(
            "INSERT INTO orders (user_id, status, total, payment_method) VALUES (?, 'pending', ?, 'transfer')",
          )
          .run(userAId, 42);
        orderAId = Number(info.lastInsertRowid);
      } finally {
        db.close();
      }

      const listA = await api(baseUrl, "GET", "/api/orders", { cookie });
      assert(listA.status === 200, `list A 200 (real ${listA.status})`);
      assert(
        Array.isArray(listA.json.orders) &&
          (listA.json.orders as unknown[]).length >= 1,
        "A ve al menos una orden",
      );

      const listB = await api(baseUrl, "GET", "/api/orders", {
        cookie: cookieB,
      });
      assert(listB.status === 200, `list B 200 (real ${listB.status})`);
      assert(
        (listB.json.orders as unknown[]).length === 0,
        "B no ve órdenes ajenas",
      );

      const detailA = await api(baseUrl, "GET", `/api/orders/${orderAId}`, {
        cookie,
      });
      assert(detailA.status === 200, `A detalle 200 (real ${detailA.status})`);

      const detailB = await api(baseUrl, "GET", `/api/orders/${orderAId}`, {
        cookie: cookieB,
      });
      assert(
        detailB.status === 404,
        `B detalle ajeno 404 (real ${detailB.status})`,
      );

      const noToken = await api(baseUrl, "GET", `/api/orders/${orderAId}`);
      assert(noToken.status === 401, `sin sesión 401 (real ${noToken.status})`);

      const badId = await api(
        baseUrl,
        "GET",
        "/api/orders/abc",
        { cookie },
      );
      assert(badId.status === 400, `id malformado 400 (real ${badId.status})`);
    },
  );

  await check(
    "A9: logout borra la cookie (Max-Age=0) — sin revocación server-side",
    async () => {
      const out = await api(baseUrl, "POST", "/api/auth/logout", {
        cookie,
      });
      assert(out.status === 204, `logout 204 (real ${out.status})`);
      const cleared = out.setCookies.find((c) => c.startsWith("auth_token="));
      assert(cleared !== undefined, "Set-Cookie al borrar");
      assert(
        /Max-Age=0/i.test(cleared) || /Expires=Thu, 01 Jan 1970/i.test(cleared),
        "cookie borrada (Max-Age=0 / Expires pasado)",
      );
      // Una petición SIN cookie ya no trae sesión (401). Reenviar la cookie
      // vieja seguiría siendo válida hasta su `exp` (C9, limitación conocida:
      // el logout solo borra la cookie del navegador).
      const withoutCookie = await api(baseUrl, "GET", "/api/auth/me");
      assert(
        withoutCookie.status === 401,
        `sin cookie tras logout → 401 (real ${withoutCookie.status})`,
      );
    },
  );

  await check(
    "A10: CSRF por origen — ajeno 403, mismo host pasa, sin Origin pasa, GET nunca bloquea",
    async () => {
      // Cookie fresca para este caso (A9 dejó la anterior sin navegador).
      const fresh = await api(baseUrl, "POST", "/api/auth/login", {
        body: { email, password },
      });
      const freshCookie = authCookie(fresh.setCookies) ?? "";
      assert(freshCookie.length > 0, "cookie fresca para CSRF");

      // POST con Origin ajeno → 403 (C4).
      const evil = await api(baseUrl, "DELETE", "/api/cart/clear", {
        cookie: freshCookie,
        headers: { Origin: "https://evil.example" },
      });
      assert(evil.status === 403, `Origin ajeno 403 (real ${evil.status})`);
      assert(
        (evil.json.error as string) === "Origen no permitido",
        "mensaje de origen",
      );

      // POST con Origin del mismo host → pasa el CSRF (y la mutación 200).
      const same = await api(baseUrl, "DELETE", "/api/cart/clear", {
        cookie: freshCookie,
        headers: { Origin: baseUrl },
      });
      assert(
        same.status === 200,
        `Origin mismo host pasa el CSRF (real ${same.status})`,
      );

      // Sin Origin (curl) → pasa el CSRF.
      const noOrigin = await api(baseUrl, "DELETE", "/api/cart/clear", {
        cookie: freshCookie,
      });
      assert(
        noOrigin.status === 200,
        `sin Origin pasa el CSRF (real ${noOrigin.status})`,
      );

      // Sec-Fetch-Site cross-site sin Origin → 403.
      const cross = await api(baseUrl, "DELETE", "/api/cart/clear", {
        cookie: freshCookie,
        headers: { "Sec-Fetch-Site": "cross-site" },
      });
      assert(
        cross.status === 403,
        `Sec-Fetch-Site cross-site 403 (real ${cross.status})`,
      );

      // Los GET nunca se bloquean (C4).
      const getEvil = await api(baseUrl, "GET", "/", {
        headers: { Origin: "https://evil.example" },
      });
      assert(getEvil.status === 200, `GET con Origin ajeno 200 (real ${getEvil.status})`);
    },
  );
}

async function main(): Promise<void> {
  console.log("Test de autenticación JWT + cookie httpOnly (spec §23)\n");
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
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  try {
    await waitForServer(baseUrl);
    await runSuite(baseUrl);

    // A11: COOKIE_SECURE=true → la cookie lleva `Secure` (C1/C5).
    const securePort = await getFreePort();
    const secureBaseUrl = `http://127.0.0.1:${securePort}`;
    console.log(
      `→ Levantando instancia con COOKIE_SECURE=true (puerto ${securePort})…`,
    );
    const secureServer = spawn(
      process.execPath,
      ["--import", "tsx", path.join(ROOT, "src", "app.ts")],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          DB_PATH: TEST_DB_PATH,
          PORT: String(securePort),
          JWT_SECRET,
          COOKIE_SECURE: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    secureServer.stdout.on("data", () => {});
    secureServer.stderr.on("data", () => {});
    try {
      await waitForServer(secureBaseUrl);
      await check(
        "A11: COOKIE_SECURE=true agrega Secure a la cookie (C1/C5)",
        async () => {
          const res = await api(
            secureBaseUrl,
            "POST",
            "/api/auth/register",
            {
              body: {
                name: "Secure",
                lastname: "User",
                email: uniqueEmail(),
                password: "Abcdef1!",
              },
            },
          );
          assert(res.status === 201, `status 201 (real ${res.status})`);
          const set = res.setCookies.find((c) => c.startsWith("auth_token="));
          assert(set !== undefined, "Set-Cookie auth_token presente");
          assert(/Secure/i.test(set), `cookie con Secure (real: ${set || "sin cookie"})`);
        },
      );
    } finally {
      secureServer.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    server.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
    }
  }

  console.log(`\nResultado: ${passes} OK, ${failures} fallidos`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
