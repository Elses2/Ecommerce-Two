import { env } from "../config/env.js";
import { ProductRepository, productRepository } from "../repositories/product.repository.js";
import type { ProductView } from "../dtos/product.dto.js";
import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";

/**
 * Servicio PURO: ensambla ProductView con atributos derivados (spec §1.3);
 * sin SQL acá — todo el acceso a datos vive en el repositorio.
 */
export class ProductService {
  /**
   * Crea una instancia de ProductService.
   *
   * @param {ProductRepository} [repository=productRepository] - Repositorio de productos.
   */
  constructor(private repository: ProductRepository = productRepository) {}

  /**
   * Convierte una entidad `Product` a `ProductView` calculando sus atributos derivados.
   *
   * @param {Product} product - Entidad base de producto.
   * @returns {ProductView} Objeto de vista con categorías, stock e imagen resueltos.
   */
  private withDerivedAttrs(product: Product): ProductView {
    const resolved = withImageFallback(product);
    return {
      ...resolved,
      categories: this.repository.findCategoriesByProduct(resolved.id),
      inStock: resolved.stock > 0,
      imageUrl: resolved.image_url,
    };
  }

  /**
   * Obtiene la lista completa de productos con atributos derivados resueltos.
   *
   * @returns {ProductView[]} Lista de productos formateados para vista.
   */
  list(): ProductView[] {
    return this.repository.list().map((p) => this.withDerivedAttrs(p));
  }

  /**
   * Detalle de producto (spec §6.8/Paso 8): el spec nombra a este método
   * findById — ProductView completo (imageUrl con fallback §2.3, inStock
   * §6.10, categorías N:M). null → el controller responde 404.
   *
   * @param {number} id - Identificador único del producto.
   * @returns {ProductView | null} El producto adaptado para vista o `null` si no existe.
   */
  findById(id: number): ProductView | null {
    const product = this.repository.findById(id);
    return product ? this.withDerivedAttrs(product) : null;
  }

  /**
   * Busca productos por coincidencia general en la base de datos.
   *
   * @param {string} q - Término de búsqueda.
   * @returns {ProductView[]} Lista de productos coincidentes.
   */
  search(q: string): ProductView[] {
    return this.repository.search(q).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * Listado con orden por precio (spec §6.12/Paso 12): sort ya normalizado por
   * el controller ("asc" | "desc"); cada producto sale como ProductView
   * completo (fallback de imagen §2.3 + inStock), igual que el resto de los
   * listados del sitio.
   *
   * @param {"asc" | "desc"} [sort] - Ordenamiento deseado por precio.
   * @returns {ProductView[]} Lista de productos ordenados.
   */
  findAllWithSort(sort?: "asc" | "desc"): ProductView[] {
    return this.repository.findAll(sort).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * Buscador server-rendered (spec §6.13/Paso 12): resultados por nombre con
   * atributos derivados ya resueltos.
   *
   * @param {string} query - Cadena de texto a buscar en los nombres.
   * @returns {ProductView[]} Lista de productos que coinciden por nombre.
   */
  searchByName(query: string): ProductView[] {
    return this.repository.searchByName(query).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * Obtiene todos los productos asociados a una categoría específica.
   *
   * @param {number} categoryId - ID de la categoría a consultar.
   * @returns {ProductView[]} Lista de productos de la categoría.
   */
  findByCategory(categoryId: number): ProductView[] {
    return this.repository.findByCategory(categoryId).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * "Te puede interesar" (spec §6.6): primeros `limit` productos — la
   * selección aleatoria queda como BONUS del spec, no se implementa ahora.
   *
   * @param {number} [limit=5] - Cantidad máxima de productos a sugerir.
   * @returns {ProductView[]} Muestra de productos sugeridos.
   */
  getSuggested(limit = 5): ProductView[] {
    return this.repository.list().slice(0, limit).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * "Los más pedidos" (spec §6.7): hasta `limit` productos al azar — la tabla
   * no tiene is_featured, así que aplica el fallback del spec (aleatorio).
   *
   * @param {number} [limit=10] - Límite de productos aleatorios a retornar.
   * @returns {ProductView[]} Productos seleccionados al azar.
   */
  getMostOrdered(limit = 10): ProductView[] {
    return this.repository.listRandom(limit).map((p) => this.withDerivedAttrs(p));
  }

  /**
   * Productos relacionados (spec §6.8/Paso 8): comparten al menos una
   * categoría con el producto dado, excluyéndolo; hasta `limit` resultados y,
   * si hay más candidatos, se eligen al azar. La selección aleatoria vive acá
   * (Fisher-Yates — el sort(() => Math.random() - 0.5) del pseudo-código del
   * spec es un barajado sesgado); el SQL queda en el repository. Cada related
   * sale como ProductView completo (fallback de imagen §2.3 + inStock §6.10).
   *
   * @param {number} productId - ID del producto actual a excluir.
   * @param {Category[]} categories - Categorías asociadas al producto.
   * @param {number} [limit=4] - Cantidad máxima de relacionados a retornar.
   * @returns {ProductView[]} Arreglo de productos relacionados aleatorizados.
   */
  getRelated(productId: number, categories: Category[], limit = 4): ProductView[] {
    const categoryIds = categories.map((category) => category.id);
    if (categoryIds.length === 0) return [];
    const candidates = this.repository.findRelatedByCategories(categoryIds, productId);
    return shuffle(candidates)
      .slice(0, limit)
      .map((p) => this.withDerivedAttrs(p));
  }
}

/**
 * Barajado Fisher-Yates: uniforme y sin mutar el arreglo original.
 *
 * @template T
 * @param {T[]} items - Arreglo de elementos a mezclar.
 * @returns {T[]} Nueva copia del arreglo en orden aleatorio.
 */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * withImageFallback (spec §2.3): producto de entrada → producto con image_url
 * resuelta. Se aplica en TODO lugar donde se devuelven productos a una vista
 * (home, listado, detalle, relacionados, sugeridos). El fallback se resuelve
 * con `env.images.fallbackUrl`.
 *
 * @param {Product} product - Entidad base de producto.
 * @returns {Product & { image_url: string }} Producto con URL de imagen asegurada.
 */
export function withImageFallback(product: Product): Product & { image_url: string } {
  return {
    ...product,
    image_url: product.image_url?.trim() ? product.image_url : env.images.fallbackUrl,
  };
}

/** Instancia singleton de ProductService. */
export const productService = new ProductService();