import BetterSqlite3 from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

// Singleton de better-sqlite3 sobre dev.db (driver síncrono, sin ORM).
// La ruta es configurable vía DB_PATH (spec §16): los tests de checkout apuntan
// a una DB temporal; si la variable falta o está vacía se usa dev.db.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta por defecto a la DB del proyecto; DB_PATH la sobreescribe (spec §16).
const DEFAULT_DB_PATH = path.join(__dirname, "../../dev.db");
const dbPath = process.env.DB_PATH?.trim() || DEFAULT_DB_PATH;

/**
 * Configura los pragmas principales de SQLite para habilitar el modo WAL y la integridad referencial.
 *
 * @param {BetterSqlite3.Database} database - Instancia de la base de datos a configurar.
 * @returns {void}
 */
function configurePragmas(database: BetterSqlite3.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
}

/**
 * Agrega una columna a una tabla existente solo si todavía no existe.
 *
 * Migración aditiva (spec §1.1): `CREATE TABLE IF NOT EXISTS` no modifica
 * tablas ya creadas; este helper hace el bootstrap idempotente sobre DBs
 * existentes. `table`, `column` y `ddl` son constantes internas del módulo
 * (nunca input del usuario), por eso se interpolan directo en el SQL.
 *
 * @param {BetterSqlite3.Database} database - Instancia de la base de datos a migrar.
 * @param {string} table - Nombre de la tabla a inspeccionar (constante interna).
 * @param {string} column - Nombre de la columna a verificar (constante interna).
 * @param {string} ddl - DDL completo de la columna para `ALTER TABLE ... ADD COLUMN`.
 * @returns {void}
 */
function addColumnIfMissing(
  database: BetterSqlite3.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as unknown as Array<{ name: string }>;
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Inicializa el esquema DDL de la base de datos creando las tablas e índices necesarios.
 *
 * Bootstrap del esquema: 6 tablas según spec §1.1 (DDL aditivo en arranque).
 * Índices UNIQUE en name habilitan INSERT OR IGNORE para seed idempotente.
 * La tabla orders ya nace con el esquema completo de checkout en instalaciones
 * nuevas; las DBs existentes se migran columna a columna con addColumnIfMissing.
 *
 * @param {BetterSqlite3.Database} database - Instancia de la base de datos donde se ejecutará el DDL.
 * @returns {void}
 */
function bootstrapSchema(database: BetterSqlite3.Database): void {
  database.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER,
    category_id INTEGER,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending',
    total REAL NOT NULL DEFAULT 0,
    checkout_token TEXT,
    shipping_name TEXT,
    shipping_email TEXT,
    shipping_phone TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_postal_code TEXT,
    shipping_country TEXT,
    payment_method TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
`);

  // Migración aditiva para DBs existentes (spec §1.1): CREATE TABLE IF NOT EXISTS
  // no altera tablas ya creadas, así que las columnas nuevas de orders se agregan
  // columna por columna cuando faltan. Lista espejo del DDL de arriba.
  const orderColumns: Array<[string, string]> = [
    ["status", "status TEXT NOT NULL DEFAULT 'pending'"],
    ["total", "total REAL NOT NULL DEFAULT 0"],
    ["checkout_token", "checkout_token TEXT"],
    ["shipping_name", "shipping_name TEXT"],
    ["shipping_email", "shipping_email TEXT"],
    ["shipping_phone", "shipping_phone TEXT"],
    ["shipping_address", "shipping_address TEXT"],
    ["shipping_city", "shipping_city TEXT"],
    ["shipping_postal_code", "shipping_postal_code TEXT"],
    ["shipping_country", "shipping_country TEXT"],
    ["payment_method", "payment_method TEXT"],
  ];
  for (const [column, ddl] of orderColumns) {
    addColumnIfMissing(database, "orders", column, ddl);
  }

  // Índice UNIQUE sobre checkout_token (spec §1.1 / §19): SQLite permite varios
  // NULL en un índice único — las órdenes sin token confirmado conviven y los
  // tokens reales son únicos (idempotencia del checkout).
  database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token ON orders(checkout_token);",
  );
}

/**
 * Crea e inicializa la conexión con la base de datos SQLite local.
 *
 * Ruta configurable vía DB_PATH (spec §16): los tests de checkout apuntan a
 * una DB temporal; si la variable falta o está vacía se usa dev.db.
 *
 * @param {string} dbPath - Ruta absoluta o relativa del archivo `.db`.
 * @returns {BetterSqlite3.Database} Instancia configurada y lista para consultas.
 */
function initDatabase(dbPath: string): BetterSqlite3.Database {
  const database = new BetterSqlite3(dbPath);
  configurePragmas(database);
  bootstrapSchema(database);
  return database;
}

const db: BetterSqlite3.Database = initDatabase(dbPath);

/**
 * Instancia singleton de la base de datos SQLite (BetterSqlite3).
 */
export default db;