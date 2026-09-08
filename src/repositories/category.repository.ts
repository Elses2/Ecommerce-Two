import type BetterSqlite3 from "better-sqlite3";
import type { Category } from "../models/category.model.js";
import db from "../config/database.js";

// Repository: sole owner of the categories SQL (project rule); better-sqlite3
// is synchronous — synchronous signatures, no fake promises (D5)
export class CategoryRepository {
  constructor(private database: BetterSqlite3.Database = db) {}

  // Spec §6.6b: nav data source (same rows the category listing uses)
  findAll(): Category[] {
    return this.database
      .prepare("SELECT * FROM categories ORDER BY id")
      .all() as unknown as Category[];
  }

  // Búsqueda por id (spec §4.6/Paso 11): el listado de categoría necesita la
  // fila para título/breadcrumb. undefined sigue la semántica de .get() de
  // better-sqlite3 — misma convención que ProductRepository.findById; el
  // service la mapea a null (contrato de productService.findById).
  findById(id: number): Category | undefined {
    return this.database
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(id) as unknown as Category | undefined;
  }
}

export const categoryRepository = new CategoryRepository();
