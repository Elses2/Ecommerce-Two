import type BetterSqlite3 from "better-sqlite3";
import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";
import db from "../config/database.js";

// Repositorio: ÚNICO dueño de todas las consultas SQL (regla del proyecto);
// better-sqlite3 es síncrono — firmas síncronas sin promesas falsas (D5)
export class ProductRepository {
  constructor(private database: BetterSqlite3.Database = db) {}

  list(): Product[] {
    return this.database
      .prepare("SELECT * FROM products ORDER BY id")
      .all() as unknown as Product[];
  }

  findById(id: number): Product | undefined {
    return this.database
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(id) as unknown as Product | undefined;
  }

  // LIKE sobre name y description (spec data-access)
  search(q: string): Product[] {
    const pattern = `%${q}%`;
    return this.database
      .prepare(
        "SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id",
      )
      .all(pattern, pattern) as unknown as Product[];
  }

  // Selección aleatoria (spec §6.7, fallback sin flag is_featured — la tabla
  // products no tiene columna de destacados): "Los más pedidos" toma hasta
  // `limit` productos al azar; el azar vive en el SQL, acá en el repositorio
  listRandom(limit: number): Product[] {
    return this.database
      .prepare("SELECT * FROM products ORDER BY RANDOM() LIMIT ?")
      .all(limit) as unknown as Product[];
  }

  // Join N:M por categoría (spec §1.2)
  findByCategory(categoryId: number): Product[] {
    return this.database
      .prepare(
        `SELECT p.* FROM products p
         JOIN product_categories pc ON pc.product_id = p.id
         WHERE pc.category_id = ?`,
      )
      .all(categoryId) as unknown as Product[];
  }

  // Join N:M por producto (spec §1.2)
  findCategoriesByProduct(productId: number): Category[] {
    return this.database
      .prepare(
        `SELECT c.* FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         WHERE pc.product_id = ?`,
      )
      .all(productId) as unknown as Category[];
  }

  // Candidatos a "relacionados" (spec §6.8/Paso 8): productos que comparten
  // al menos una categoría con el producto dado, excluyéndolo. DISTINCT evita
  // duplicados cuando comparten varias categorías; better-sqlite3 no acepta
  // arrays, así que los placeholders del IN se generan por categoría.
  findRelatedByCategories(categoryIds: number[], excludeProductId: number): Product[] {
    const placeholders = categoryIds.map(() => "?").join(", ");
    return this.database
      .prepare(
        `SELECT DISTINCT p.* FROM products p
         JOIN product_categories pc ON pc.product_id = p.id
         WHERE pc.category_id IN (${placeholders}) AND p.id <> ?
         ORDER BY p.id`,
      )
      .all(...categoryIds, excludeProductId) as unknown as Product[];
  }
}

export const productRepository = new ProductRepository();
