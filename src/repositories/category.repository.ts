import type BetterSqlite3 from "better-sqlite3";
import type { Category } from "../models/category.model.js";
import db from "../config/database.js";

/**
 * Repositorio de categorías: único encargado de las consultas SQL relacionadas con categorías.
 *
 * // Repository: sole owner of the categories SQL (project rule); better-sqlite3
 * // is synchronous — synchronous signatures, no fake promises (D5)
 */
export class CategoryRepository {
  /**
   * Inicializa la instancia del repositorio de categorías.
   *
   * @param {BetterSqlite3.Database} [database=db] - Instancia de la base de datos SQLite.
   */
  constructor(private database: BetterSqlite3.Database = db) {}

  /**
   * Obtiene todas las categorías ordenadas por su ID.
   *
   * // Spec §6.6b: nav data source (same rows the category listing uses)
   *
   * @returns {Category[]} Lista con todas las categorías registradas.
   */
  findAll(): Category[] {
    return this.database
      .prepare("SELECT * FROM categories ORDER BY id")
      .all() as unknown as Category[];
  }

  /**
   * Busca una categoría según su ID numérico.
   *
   * // Búsqueda por id (spec §4.6/Paso 11): el listado de categoría necesita la
   * // fila para título/breadcrumb. undefined sigue la semántica de .get() de
   * // better-sqlite3 — misma convención que ProductRepository.findById; el
   * // service la mapea a null (contrato de productService.findById).
   *
   * @param {number} id - Identificador único de la categoría.
   * @returns {Category | undefined} La categoría encontrada o `undefined` si no existe.
   */
  findById(id: number): Category | undefined {
    return this.database
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(id) as unknown as Category | undefined;
  }
}

/** Instancia singleton de `CategoryRepository`. */
export const categoryRepository = new CategoryRepository();