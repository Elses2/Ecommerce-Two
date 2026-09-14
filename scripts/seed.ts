// Seed idempotente (task 2.5): INSERT OR IGNORE sobre SQLite — re-ejecutable sin duplicar.
// Crea el esquema (bootstrap en database.ts) y puebla 4 productos + 3 categorías + joins N:M
// según el spec §1.4 (Teclado, Mouse, Monitor, Headset × Periféricos, Monitores, Audio).
import db from "../src/config/database.js";
import { productRepository } from "../src/repositories/product.repository.js";

const categories: Array<{ name: string; description: string | null }> = [
  { name: "Periféricos", description: "Dispositivos de entrada y sonido para tu setup" },
  { name: "Monitores", description: "Pantallas para trabajo y gaming" },
  { name: "Audio", description: "Auriculares y sonido inmersivo" },
];

const products: Array<{
  name: string;
  description: string | null;
  image_url: string | null;
  stock: number;
  price: number;
  categories: string[];
}> = [
  {
    name: "Teclado Mecánico",
    description: "Teclado mecánico RGB switches azules",
    image_url: null,
    stock: 10,
    price: 89.99,
    categories: ["Periféricos"],
  },
  {
    name: "Mouse Gamer",
    description: "Mouse gamer 16000 DPI con iluminación RGB",
    image_url: null,
    stock: 25,
    price: 49.5,
    categories: ["Periféricos"],
  },
  {
    name: 'Monitor 24"',
    description: "Monitor 24 pulgadas 144Hz Full HD",
    image_url: null,
    stock: 7,
    price: 199.0,
    categories: ["Monitores", "Periféricos"],
  },
  {
    name: "Headset",
    description: "Headset 7.1 con micrófono desmontable",
    image_url: null,
    stock: 0,
    price: 59.9,
    categories: ["Audio"],
  },
];

function seed(): void {
  // INSERT OR IGNORE + UNIQUE index (D4): re-ejecutar no duplica filas
  const insertCategory = db.prepare(
    "INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)",
  );
  const insertProduct = db.prepare(
    "INSERT OR IGNORE INTO products (name, description, image_url, stock, price) VALUES (?, ?, ?, ?, ?)",
  );
  const insertJoin = db.prepare(
    "INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)",
  );
  const selectCategoryId = db.prepare("SELECT id FROM categories WHERE name = ?");
  const selectProductId = db.prepare("SELECT id FROM products WHERE name = ?");

  db.transaction(() => {
    for (const c of categories) insertCategory.run(c.name, c.description);
    for (const p of products) {
      insertProduct.run(p.name, p.description, p.image_url, p.stock, p.price);
      const product = selectProductId.get(p.name) as { id: number } | undefined;
      if (!product) continue;
      for (const catName of p.categories) {
        const category = selectCategoryId.get(catName) as { id: number } | undefined;
        if (category) insertJoin.run(product.id, category.id);
      }
    }
  })();

  const counts = {
    products: (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n,
    categories: (db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n,
    joins: (db.prepare("SELECT COUNT(*) AS n FROM product_categories").get() as { n: number }).n,
  };
  console.log(
    `Seed OK: ${counts.products} productos, ${counts.categories} categorías, ${counts.joins} joins N:M`,
  );
  console.log(`Verificación servicio: ${productRepository.list().length} productos accesibles`);
}

seed();
