// Test de autenticación JWT (spec §23): casos A1–A6 contra una DB temporal.
// Runner: tsx (igual que test-checkout / test-middlewares). La DB NUNCA es
// dev.db: se genera una ruta temporal en os.tmpdir() y se pasa por DB_PATH al
// proceso hijo (`node --import tsx src/app.ts`), que arranca en un puerto libre.
// Salida: exit code 0 si todo pasa, 1 si algo falla.
//
// A1 register OK · A2 email repetido (incluida la carrera) · A3 validación ·
// A4 login OK · A5 credenciales inválidas · A6 /me (válido/ausente/expirado/
// manipulado/otro algoritmo). A7/A8 (autorización por rol/propiedad) son del PR 2.
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
}

async function api(
  baseUrl: string,
  method: string,
  pathname: string,
  options: { body?: unknown; token?: string } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
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
  return { status: res.status, text, json };
}

function uniqueEmail(): string {
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function runSuite(baseUrl: string): Promise<void> {
  const email = uniqueEmail();
  const password = "Abcdef1!";
  let token = "";
  let userAId = 0;

  await check(
    "A1: register OK devuelve token y no filtra password_hash",
    async () => {
      const res = await api(baseUrl, "POST", "/api/auth/register", {
        body: { name: "Ana", lastname: "Pérez", email, password },
      });
      assert(res.status === 201, `status 201 (real ${res.status})`);
      assert(
        typeof res.json.token === "string" && res.json.token.length > 0,
        "devuelve token",
      );
      assert(!res.text.includes("password_hash"), "no filtra password_hash");
      const user = res.json.user as Record<string, unknown>;
      assert(user.email === email, "email correcto");
      assert(user.role === "customer", "rol customer");
      token = res.json.token as string;
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

  await check("A4: login OK devuelve token", async () => {
    const res = await api(baseUrl, "POST", "/api/auth/login", {
      body: { email, password },
    });
    assert(res.status === 200, `status 200 (real ${res.status})`);
    assert(
      typeof res.json.token === "string" && res.json.token.length > 0,
      "devuelve token",
    );
  });

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
    "A6: /me válido, ausente, expirado, manipulado y otro algoritmo",
    async () => {
      const valid = await api(baseUrl, "GET", "/api/auth/me", { token });
      assert(valid.status === 200, `válido 200 (real ${valid.status})`);
      assert(
        (valid.json.user as Record<string, unknown>).email === email,
        "usuario correcto",
      );

      const absent = await api(baseUrl, "GET", "/api/auth/me");
      assert(absent.status === 401, `ausente 401 (real ${absent.status})`);

      const manipulated = await api(baseUrl, "GET", "/api/auth/me", {
        token: `${token}x`,
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
        token: expired,
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
        token: otherAlg,
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
      const tokenB = registerB.json.token as string;

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

      const listA = await api(baseUrl, "GET", "/api/orders", { token });
      assert(listA.status === 200, `list A 200 (real ${listA.status})`);
      assert(
        Array.isArray(listA.json.orders) &&
          (listA.json.orders as unknown[]).length >= 1,
        "A ve al menos una orden",
      );

      const listB = await api(baseUrl, "GET", "/api/orders", { token: tokenB });
      assert(listB.status === 200, `list B 200 (real ${listB.status})`);
      assert(
        (listB.json.orders as unknown[]).length === 0,
        "B no ve órdenes ajenas",
      );

      const detailA = await api(baseUrl, "GET", `/api/orders/${orderAId}`, {
        token,
      });
      assert(detailA.status === 200, `A detalle 200 (real ${detailA.status})`);

      const detailB = await api(baseUrl, "GET", `/api/orders/${orderAId}`, {
        token: tokenB,
      });
      assert(
        detailB.status === 404,
        `B detalle ajeno 404 (real ${detailB.status})`,
      );

      const noToken = await api(baseUrl, "GET", `/api/orders/${orderAId}`);
      assert(noToken.status === 401, `sin token 401 (real ${noToken.status})`);

      const badId = await api(baseUrl, "GET", "/api/orders/abc", { token });
      assert(badId.status === 400, `id malformado 400 (real ${badId.status})`);
    },
  );
}

async function main(): Promise<void> {
  console.log("Test de autenticación JWT (spec §23)\n");
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
        SESSION_SECRET: "test-session-secret",
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
