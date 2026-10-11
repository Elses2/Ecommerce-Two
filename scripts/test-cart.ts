// Test del carrito en Redis (spec §24): casos C1–C6 contra una DB temporal y la
// base Redis de pruebas. Runner: tsx (igual que seed/test-checkout).
//
// Seguridad: la DB es una ruta temporal en os.tmpdir() (NUNCA dev.db) y el
// FLUSHDB solo se ejecuta si `REDIS_URL` apunta a la base `/15`; contra
// cualquier otra URL el script aborta para no borrar datos reales.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `cart-test-${process.pid}-${Date.now()}.db`,
);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/15";

// Guardia: nunca usar dev.db.
const DEFAULT_DB = path.resolve(ROOT, "dev.db");
if (path.resolve(TEST_DB_PATH) === DEFAULT_DB) {
  console.error(
    "ERROR: DB_PATH resuelve a dev.db — el test exige una DB temporal.",
  );
  process.exit(1);
}
// Guardia: solo limpiar Redis si es la base de tests /15.
if (!/\/15$/.test(REDIS_URL)) {
  console.error(
    `ERROR: REDIS_URL debe apuntar a la base /15 (recibido: ${REDIS_URL}).`,
  );
  process.exit(1);
}

process.env.DB_PATH = TEST_DB_PATH;
process.env.REDIS_URL = REDIS_URL;

const { default: db } = await import("../src/config/database.js");
const { redis, cartRepository } =
  await import("../src/repositories/cart.repository.js");
const { cartService } = await import("../src/services/cart.service.js");
const { checkoutService } = await import("../src/services/checkout.service.js");
const { userRepository } =
  await import("../src/repositories/user.repository.js");
const { productService } = await import("../src/services/product.service.js");

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

function insertProduct(name: string, stock: number, price: number): number {
  const info = db
    .prepare(
      "INSERT INTO products (name, description, image_url, stock, price) VALUES (?, NULL, NULL, ?, ?)",
    )
    .run(name, stock, price);
  return Number(info.lastInsertRowid);
}

function createUser(email: string): number {
  return userRepository.create({ name: "Cart Test", email, passwordHash: "!" })
    .id;
}

function validDto(token: string) {
  return {
    firstName: "Ana",
    lastName: "Pérez",
    email: "ana@example.com",
    phone: "+54 11 1234 5678",
    address: "Av. Siempreviva 742",
    city: "Córdoba",
    postalCode: "5000",
    country: "Argentina",
    paymentMethod: "transfer" as const,
    checkoutToken: token,
  };
}

async function runSuite(): Promise<void> {
  await redis.flushdb();
  const userA = createUser(`cart-a-${Date.now()}@example.com`);
  const userB = createUser(`cart-b-${Date.now()}@example.com`);

  await check("C1: aislamiento — el carrito de A no es el de B", async () => {
    const productId = insertProduct("C1-producto", 10, 15);
    await cartService.addItem(userA, productId);
    const cartA = await cartService.getCartWithDetails(userA);
    const cartB = await cartService.getCartWithDetails(userB);
    assert(cartA.count === 1, `A ve 1 (real ${cartA.count})`);
    assert(cartB.count === 0, `B ve 0 (real ${cartB.count})`);
  });

  await check("C2: HINCRBY concurrente suma exacto", async () => {
    const productId = insertProduct("C2-producto", 100, 5);
    const user = createUser(`cart-c2-${Date.now()}@example.com`);
    await Promise.all(
      Array.from({ length: 25 }, () =>
        cartRepository.increment(user, productId, 1),
      ),
    );
    const cart = await cartService.getCartWithDetails(user);
    assert(cart.count === 25, `25 incrementos exactos (real ${cart.count})`);
  });

  await check("C3: cantidad <= 0 elimina el ítem", async () => {
    const productId = insertProduct("C3-producto", 10, 5);
    const user = createUser(`cart-c3-${Date.now()}@example.com`);
    await cartService.addItem(user, productId);
    await cartService.updateQuantity(user, productId, -1);
    const cart = await cartService.getCartWithDetails(user);
    assert(cart.items.length === 0, "el ítem se eliminó al llegar a 0");
  });

  await check("C4: el carrito persiste en Redis (nueva conexión)", async () => {
    const productId = insertProduct("C4-producto", 10, 5);
    const user = createUser(`cart-c4-${Date.now()}@example.com`);
    await cartService.addItem(user, productId);
    const other = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    try {
      const raw = await other.hgetall(`cart:${user}`);
      assert(
        raw[String(productId)] === "1",
        "el Hash persiste para otra conexión",
      );
    } finally {
      await other.quit();
    }
  });

  await check("C5: los precios se recalculan desde SQLite", async () => {
    const productId = insertProduct("C5-producto", 10, 100);
    const user = createUser(`cart-c5-${Date.now()}@example.com`);
    await cartService.addItem(user, productId);
    const before = await cartService.getCartWithDetails(user);
    assert(before.total === 100, `total inicial 100 (real ${before.total})`);
    db.prepare("UPDATE products SET price = ? WHERE id = ?").run(
      200,
      productId,
    );
    const after = await cartService.getCartWithDetails(user);
    assert(after.total === 200, `total recalculado 200 (real ${after.total})`);
    assert(
      productService.findById(productId)?.price === 200,
      "precio de DB actualizado",
    );
  });

  await check("C6: checkout exitoso vacía el carrito", async () => {
    const productId = insertProduct("C6-producto", 5, 30);
    const user = createUser(`cart-c6-${Date.now()}@example.com`);
    await cartService.addItem(user, productId);
    const lines = await cartService.getLines(user);
    const result = checkoutService.createOrder(
      lines,
      validDto("6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a"),
      user,
    );
    assert(result.ok, "la orden se creó");
    await cartService.clear(user);
    const cart = await cartService.getCartWithDetails(user);
    assert(cart.count === 0, "el carrito quedó vacío tras el checkout");
  });
}

async function main(): Promise<void> {
  console.log("Test del carrito en Redis (spec §24)\n");
  try {
    await runSuite();
  } finally {
    await redis.quit();
    for (const suffix of ["", "-wal", "-shm"]) {
      await import("node:fs").then((fs) =>
        fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true }),
      );
    }
  }
  console.log(`\nResultado: ${passes} OK, ${failures} fallidos`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
