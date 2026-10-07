// Test de checkout (Fase 6, spec §19): casos T1-T7 contra una DB temporal.
// Runner: tsx (igual que seed). La DB NUNCA es dev.db: el script genera una
// ruta temporal en os.tmpdir(), la setea en DB_PATH ANTES de importar el árbol
// de módulos (database.ts lee la env al inicializar) y la borra al final.
// Salida: exit code 0 si todo pasa, 1 si algo falla.
//
// T5 (carrera multi-proceso) es el caso central: N procesos hijos compran la
// última unidad contra el MISMO archivo; se espera exactamente 1 éxito, stock
// 0 y ningún SQLITE_BUSY sin manejar. Los hijos corren este mismo script en
// modo CHECKOUT_TEST_CHILD=1 (spawn con `node --import tsx`).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckoutRequestDto, CheckoutResultDto } from "../src/dtos/checkout.dto.js";

// ── Configuración de la DB temporal ─────────────────────────────────────────
const CHILD_MODE = process.env.CHECKOUT_TEST_CHILD === "1";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TEST_DB_PATH = CHILD_MODE
  ? (process.env.DB_PATH ?? "")
  : path.join(os.tmpdir(), `checkout-test-${process.pid}-${Date.now()}.db`);

if (!CHILD_MODE) {
  process.env.DB_PATH = TEST_DB_PATH;
  // Guardia de seguridad: si alguien corre el test con DB_PATH=dev.db (o sin
  // darse cuenta resuelve a la ruta por defecto), fallar antes de tocar nada.
  const defaultDb = path.resolve(path.dirname(SCRIPT_PATH), "../dev.db");
  if (path.resolve(TEST_DB_PATH) === defaultDb) {
    console.error("ERROR: DB_PATH resuelve a dev.db — el test exige una DB temporal.");
    process.exit(1);
  }
}

// Import dinámico: primero se setea DB_PATH, DESPUÉS se carga el árbol de
// módulos (los imports estáticos se evalúan antes que el cuerpo del módulo).
const { default: db } = await import("../src/config/database.js");
const { checkoutService } = await import("../src/services/checkout.service.js");
const { orderRepository } = await import("../src/repositories/order.repository.js");
const { userRepository } = await import("../src/repositories/user.repository.js");

// ── Helpers ─────────────────────────────────────────────────────────────────
function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FALLIDA: ${message}`);
  }
}

function insertProduct(name: string, stock: number, price: number): number {
  const info = db
    .prepare(
      "INSERT INTO products (name, description, image_url, stock, price) VALUES (?, NULL, NULL, ?, ?)",
    )
    .run(name, stock, price);
  return Number(info.lastInsertRowid);
}

function getStock(productId: number): number {
  const row = db.prepare("SELECT stock FROM products WHERE id = ?").get(productId) as
    | { stock: number }
    | undefined;
  assert(row !== undefined, `producto ${productId} no encontrado`);
  return row.stock;
}

function countRows(sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { n: number };
  return row.n;
}

function validDto(token: string): CheckoutRequestDto {
  return {
    firstName: "Ana",
    lastName: "Pérez",
    email: "ana@example.com",
    phone: "+54 11 1234 5678",
    address: "Av. Siempreviva 742",
    city: "Córdoba",
    postalCode: "5000",
    country: "Argentina",
    paymentMethod: "transfer",
    checkoutToken: token,
  };
}

// ── T5: modo hijo (comprador en carrera) ────────────────────────────────────
async function runBuyerChild(): Promise<void> {
  const token = process.env.CHECKOUT_TEST_TOKEN ?? "";
  const productId = Number(process.env.CHECKOUT_TEST_PRODUCT_ID ?? "0");
  try {
    const result = checkoutService.createOrder(
      [{ productId, quantity: 1 }],
      validDto(token),
    );
    // Una sola línea JSON en stdout — el padre parsea la última.
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}

function spawnBuyer(token: string, productId: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", SCRIPT_PATH], {
      env: {
        ...process.env,
        CHECKOUT_TEST_CHILD: "1",
        CHECKOUT_TEST_TOKEN: token,
        CHECKOUT_TEST_PRODUCT_ID: String(productId),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function parseChildResult(stdout: string): { ok: boolean; message: string } {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  const parsed = JSON.parse(lines[lines.length - 1] ?? "{}") as {
    ok: boolean;
    errors?: string[];
    error?: string;
  };
  if (parsed.ok) {
    return { ok: true, message: "ok" };
  }
  return { ok: false, message: parsed.error ?? parsed.errors?.join("; ") ?? "error desconocido" };
}

// ── Suite de casos ──────────────────────────────────────────────────────────
async function runSuite(): Promise<void> {
  let failures = 0;
  const cases: Array<{ name: string; run: () => Promise<void> | void }> = [
    {
      // T1: dos tokens distintos por la última unidad → 1 éxito + 1 error de stock.
      name: "T1: stock se agota tras la primera compra",
      run() {
        const productId = insertProduct("T1-solo-unidad", 1, 10);
        const tokenA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        const tokenB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

        const first = checkoutService.createOrder([{ productId, quantity: 1 }], validDto(tokenA));
        assert(first.ok, "la primera compra debería tener éxito");
        const second = checkoutService.createOrder([{ productId, quantity: 1 }], validDto(tokenB));
        assert(!second.ok, "la segunda compra debería fallar por stock");
        assert(second.ok === false && second.errors[0]?.includes("stock"), "error de stock esperado");

        assert(getStock(productId) === 0, "stock debería quedar en 0");
        const orders = countRows(
          "SELECT COUNT(*) AS n FROM orders WHERE checkout_token IN (?, ?)",
          tokenA,
          tokenB,
        );
        assert(orders === 1, "solo una orden debería existir");
      },
    },
    {
      // T2: una línea sin stock → rollback TOTAL (stock intacto, sin filas).
      name: "T2: fallo de una línea revierte toda la transacción",
      run() {
        const p1 = insertProduct("T2-con-stock", 5, 10);
        const p2 = insertProduct("T2-sin-stock", 0, 20);
        const ordersBefore = countRows("SELECT COUNT(*) AS n FROM orders");
        const itemsBefore = countRows("SELECT COUNT(*) AS n FROM order_items");

        const result = checkoutService.createOrder(
          [
            { productId: p1, quantity: 1 },
            { productId: p2, quantity: 1 },
          ],
          validDto("cccccccccccccccccccccccccccccccc"),
        );
        assert(!result.ok, "debería fallar por el producto sin stock");
        assert(getStock(p1) === 5, "el stock del primer producto no debe tocarse");
        assert(
          countRows("SELECT COUNT(*) AS n FROM orders") === ordersBefore,
          "no debe crearse ninguna orden",
        );
        assert(
          countRows("SELECT COUNT(*) AS n FROM order_items") === itemsBefore,
          "no debe crearse ningún item",
        );
      },
    },
    {
      // T3: mismo token dos veces → misma orden, stock descontado una sola vez.
      name: "T3: reenvío con el mismo token no duplica la orden",
      run() {
        const productId = insertProduct("T3-idempotente", 3, 7);
        const token = "dddddddddddddddddddddddddddddddd";

        const first = checkoutService.createOrder([{ productId, quantity: 1 }], validDto(token));
        assert(first.ok, "primer envío debería tener éxito");
        const second = checkoutService.createOrder([{ productId, quantity: 1 }], validDto(token));
        assert(second.ok, "reenvío con el mismo token debería tener éxito (D6)");
        assert(
          second.ok === true && first.ok === true && second.orderId === first.orderId,
          "el reenvío debe devolver la MISMA orden",
        );

        assert(getStock(productId) === 2, "el stock debe descontarse una sola vez");
        assert(
          countRows("SELECT COUNT(*) AS n FROM orders WHERE checkout_token = ?", token) === 1,
          "debe existir una sola orden con ese token",
        );
      },
    },
    {
      // T4: el unit_price queda congelado aunque el precio cambie después.
      name: "T4: unit_price congelado al momento de la compra",
      run() {
        const productId = insertProduct("T4-precio-congelado", 1, 100);
        const result = checkoutService.createOrder([{ productId, quantity: 1 }], validDto("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"));
        assert(result.ok, "la compra debería tener éxito");
        assert(result.ok === true, "resultado ok esperado");

        db.prepare("UPDATE products SET price = 999 WHERE id = ?").run(productId);
        const items = orderRepository.findItemsByOrderId(result.ok === true ? result.orderId : 0);
        assert(items.length === 1, "debe existir un item");
        assert(items[0]?.unit_price === 100, "unit_price debe seguir en 100 (congelado)");
      },
    },
    {
      // T5: N hijos compran la última unidad en paralelo → exactamente 1 éxito.
      name: "T5: carrera multi-proceso por la última unidad",
      async run() {
        const productId = insertProduct("T5-ultima-unidad", 1, 50);
        // Pre-siembra del guest: users.email es UNIQUE y ensureGuestUser hace
        // check-then-insert — si los hijos compitieran por crearlo, el
        // perdedor rompería con SQLITE_CONSTRAINT_UNIQUE (ruido ajeno a la
        // carrera de stock que T5 quiere medir).
        userRepository.ensureGuestUser();

        const CHILDREN = 8;
        // 32 hex [a-f0-9] únicos por hijo (formato que exige el service).
        // Prefijo "5a" distintivo: ninguna otra caso usa tokens que empiecen así.
        const tokens = Array.from({ length: CHILDREN }, (_, i) =>
          `5a${String(i).padStart(2, "0")}${"b".repeat(28)}`,
        );
        const results = await Promise.all(
          tokens.map((token) => spawnBuyer(token, productId)),
        );

        let successes = 0;
        let busyOrCrashed = 0;
        results.forEach((result, i) => {
          if (result.code !== 0) {
            busyOrCrashed += 1;
            console.error(`hijo ${i} crasheó (exit ${result.code}): ${result.stderr.trim()}`);
            return;
          }
          const parsed = parseChildResult(result.stdout);
          if (parsed.ok) {
            successes += 1;
          } else if (parsed.message.includes("SQLITE_BUSY")) {
            busyOrCrashed += 1;
            console.error(`hijo ${i} reportó SQLITE_BUSY sin manejar: ${parsed.message}`);
          } else if (!parsed.message.includes("stock")) {
            console.error(`hijo ${i} falló con error inesperado: ${parsed.message}`);
          }
        });

        assert(successes === 1, `exactamente 1 hijo debe comprar la última unidad (hubo ${successes})`);
        assert(busyOrCrashed === 0, "ningún hijo debe crashear ni reportar SQLITE_BUSY");
        assert(getStock(productId) === 0, "el stock final debe ser 0 (nunca negativo)");
        assert(
          countRows("SELECT COUNT(*) AS n FROM orders WHERE checkout_token LIKE '5a%'") === 1,
          "debe existir exactamente 1 orden de la carrera",
        );
      },
    },
    {
      // T6: validación del formulario — errores específicos por campo.
      name: "T6: errores de validación del formulario",
      run() {
        const dto = validDto("ffffffffffffffffffffffffffffffff");
        const badEmail = checkoutService.validateCheckoutInput({
          ...dto,
          email: "no-es-un-email",
        });
        assert(badEmail.some((e) => e.includes("email")), "error de email esperado");

        const shortPhone = checkoutService.validateCheckoutInput({
          ...dto,
          phone: "1234",
        });
        assert(shortPhone.some((e) => e.includes("teléfono")), "error de teléfono esperado");

        const badMethod = checkoutService.validateCheckoutInput({
          ...dto,
          paymentMethod: "bitcoin" as CheckoutRequestDto["paymentMethod"],
        });
        assert(badMethod.some((e) => e.includes("método de pago")), "error de método de pago esperado");

        const badToken = checkoutService.validateCheckoutInput({
          ...dto,
          checkoutToken: "corto",
        });
        assert(badToken.some((e) => e.includes("token de checkout")), "error de token esperado");

        const emptyCart = checkoutService.createOrder([], dto);
        assert(!emptyCart.ok, "carrito vacío debe fallar");
        assert(
          emptyCart.ok === false && emptyCart.errors[0]?.includes("carrito"),
          "mensaje de carrito vacío esperado",
        );
      },
    },
    {
      // T7: reenvío con el carrito YA vaciado → devuelve la orden existente (D6).
      name: "T7: reenvío con carrito vacío y token existente es idempotente",
      run() {
        const productId = insertProduct("T7-reenvio-post-vaciado", 2, 30);
        const token = "77777777777777777777777777777777";

        const first = checkoutService.createOrder([{ productId, quantity: 1 }], validDto(token));
        assert(first.ok, "primer envío debería tener éxito");
        const firstId = first.ok === true ? first.orderId : 0;

        // El carrito ya se vació (clear del controller tras el primer POST) —
        // el segundo POST llega con líneas vacías pero el mismo token.
        const resubmit = checkoutService.createOrder([], validDto(token));
        assert(resubmit.ok, "el reenvío debe tener éxito aunque el carrito esté vacío (D6)");
        assert(
          resubmit.ok === true && resubmit.orderId === firstId,
          "el reenvío debe devolver la MISMA orden",
        );

        assert(getStock(productId) === 1, "el stock debe descontarse una sola vez");
        assert(
          countRows("SELECT COUNT(*) AS n FROM orders WHERE checkout_token = ?", token) === 1,
          "debe existir una sola orden con ese token",
        );
      },
    },
  ];

  for (const c of cases) {
    try {
      await c.run();
      console.log(`[OK] ${c.name}`);
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${c.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} caso(s) fallido(s) — DB temporal: ${TEST_DB_PATH}`);
    process.exitCode = 1;
  } else {
    console.log(`\nCheckout tests OK (${cases.length} casos) — DB temporal: ${TEST_DB_PATH}`);
  }
}

// ── Cleanup: borrar la DB temporal (db + -wal + -shm) ───────────────────────
function cleanup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
if (CHILD_MODE) {
  await runBuyerChild();
} else {
  try {
    await runSuite();
  } finally {
    cleanup();
  }
}
