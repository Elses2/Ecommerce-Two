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
}

export const categoryRepository = new CategoryRepository();
