import type BetterSqlite3 from "better-sqlite3";
import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";
import db from "../config/database.js";

/**
 * Repositorio de productos: único encargado de ejecutar consultas SQL sobre la tabla de productos.
 *
 * // Repositorio: ÚNICO dueño de todas las consultas SQL (regla del proyecto);
 * // better-sqlite3 es síncrono — firmas síncronas sin promesas falsas (D5)
 */
export class ProductRepository {
  /**
   * Inicializa la instancia del repositorio de productos.
   *
   * @param {BetterSqlite3.Database} [database=db] - Instancia de la base de datos SQLite.
   */
  constructor(private database: BetterSqlite3.Database = db) {}

  /**
   * Lista todos los productos ordenados por ID por defecto.
   *
   * @returns {Product[]} Arreglo completo de productos.
   */
  list(): Product[] {
    return this.database
      .prepare("SELECT * FROM products ORDER BY id")
      .all() as unknown as Product[];
  }

  /**
   * Obtiene la lista de productos ordenada por precio (ascendente o descendente).
   *
   * // Listado ordenado por precio (spec §6.12/Paso 12): el controller normaliza
   * // sort a "asc" | "desc" (whitelist) — acá el ternario fija ASC como default
   * // y JAMÁS interpola input crudo del usuario en el SQL. Queda separado de
   * // list() porque Home (sugeridos/más pedidos) necesita el orden estable por id.
   *
   * @param {"asc" | "desc"} [sort] - Criterio opcional de ordenamiento por precio ('asc' o 'desc').
   * @returns {Product[]} Lista de productos ordenados por precio.
   */
  findAll(sort?: "asc" | "desc"): Product[] {
    const order = sort === "desc" ? "DESC" : "ASC";
    return this.database
      .prepare(`SELECT * FROM products ORDER BY price ${order}`)
      .all() as unknown as Product[];
  }

  /**
   * Busca un producto por su identificador único.
   *
   * @param {number} id - Identificador ID del producto.
   * @returns {Product | undefined} El producto obtenido o `undefined` si no existe.
   */
  findById(id: number): Product | undefined {
    return this.database
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(id) as unknown as Product | undefined;
  }

  /**
   * Realiza una búsqueda mediante coincidencias `LIKE` tanto en el nombre como en la descripción del producto.
   *
   * // LIKE sobre name y description (spec data-access)
   *
   * @param {string} q - Término o texto a buscar.
   * @returns {Product[]} Lista de productos que coinciden con el término.
   */
  search(q: string): Product[] {
    const pattern = `%${q}%`;
    return this.database
      .prepare(
        "SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id",
      )
      .all(pattern, pattern) as unknown as Product[];
  }

  /**
   * Busca productos coincidentes únicamente por su nombre (para el buscador server-rendered).
   *
   * // Buscador server-rendered (spec §6.13/Paso 12): LIKE solo por name — el
   * // patrón %query% viaja como parámetro (placeholder ?), nunca concatenado
   * // al SQL.
   *
   * @param {string} query - Cadena de texto a buscar en el nombre del producto.
   * @returns {Product[]} Productos coincidentes por nombre.
   */
  searchByName(query: string): Product[] {
    return this.database
      .prepare("SELECT * FROM products WHERE name LIKE ?")
      .all(`%${query}%`) as unknown as Product[];
  }

  /**
   * Retorna una muestra aleatoria de productos hasta el límite especificado.
   *
   * // Selección aleatoria (spec §6.7, fallback sin flag is_featured — la tabla
   * // products no tiene columna de destacados): "Los más pedidos" toma hasta
   * // `limit` productos al azar; el azar vive en el SQL, acá en el repositorio
   *
   * @param {number} limit - Cantidad máxima de productos aleatorios a obtener.
   * @returns {Product[]} Muestra de productos aleatorios.
   */
  listRandom(limit: number): Product[] {
    return this.database
      .prepare("SELECT * FROM products ORDER BY RANDOM() LIMIT ?")
      .all(limit) as unknown as Product[];
  }

  /**
   * Obtiene todos los productos asociados a una categoría específica mediante una tabla intermedia (relación N:M).
   *
   * // Join N:M por categoría (spec §1.2)
   *
   * @param {number} categoryId - Identificador único de la categoría.
   * @returns {Product[]} Lista de productos pertenecientes a la categoría.
   */
  findByCategory(categoryId: number): Product[] {
    return this.database
      .prepare(
        `SELECT p.* FROM products p
         JOIN product_categories pc ON pc.product_id = p.id
         WHERE pc.category_id = ?`,
      )
      .all(categoryId) as unknown as Product[];
  }

  /**
   * Obtiene las categorías vinculadas a un producto determinado.
   *
   * // Join N:M por producto (spec §1.2)
   *
   * @param {number} productId - Identificador único del producto.
   * @returns {Category[]} Lista de categorías asociadas al producto.
   */
  findCategoriesByProduct(productId: number): Category[] {
    return this.database
      .prepare(
        `SELECT c.* FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         WHERE pc.product_id = ?`,
      )
      .all(productId) as unknown as Category[];
  }

  /**
   * Obtiene productos relacionados que compartan al menos una categoría con el producto evaluado.
   *
   * // Candidatos a "relacionados" (spec §6.8/Paso 8): productos que comparten
   * // al menos una categoría con el producto dado, excluyéndolo. DISTINCT evita
   * // duplicados cuando comparten varias categorías; better-sqlite3 no acepta
   * // arrays, así que los placeholders del IN se generan por categoría.
   *
   * @param {number[]} categoryIds - Arreglo de IDs de categorías compartidas.
   * @param {number} excludeProductId - ID del producto actual que se excluirá de la búsqueda.
   * @returns {Product[]} Arreglo de productos relacionados sin duplicados.
   */
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

/** Instancia singleton de `ProductRepository`. */
export const productRepository = new ProductRepository();