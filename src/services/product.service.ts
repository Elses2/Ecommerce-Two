import { isCloudinaryConfigured } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { ProductRepository, productRepository } from "../repositories/product.repository.js";
import type { ProductView } from "../dtos/product.dto.js";
import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";

// Fallback de imagen (spec §2.3): mientras Cloudinary no esté configurado se
// sirve la estática local /img/fallback.png (alternativa permitida por §2.2);
// una vez configurado, el fallback vive en la nube de la cuenta (D7)
function fallbackImageUrl(): string {
  if (isCloudinaryConfigured) {
    const { cloudName, folder } = env.cloudinary;
    return `https://res.cloudinary.com/${cloudName}/image/upload/${folder}/fallback.png`;
  }
  return "/img/fallback.png";
}

// Servicio PURO: ensambla ProductView con atributos derivados (spec §1.3);
// sin SQL acá — todo el acceso a datos vive en el repositorio
export class ProductService {
  constructor(private repository: ProductRepository = productRepository) {}

  private withDerivedAttrs(product: Product): ProductView {
    const resolved = withImageFallback(product);
    return {
      ...resolved,
      categories: this.repository.findCategoriesByProduct(resolved.id),
      inStock: resolved.stock > 0,
      imageUrl: resolved.image_url,
    };
  }

  list(): ProductView[] {
    return this.repository.list().map((p) => this.withDerivedAttrs(p));
  }

  // Detalle de producto (spec §6.8/Paso 8): el spec nombra a este método
  // findById — ProductView completo (imageUrl con fallback §2.3, inStock
  // §6.10, categorías N:M). null → el controller responde 404.
  findById(id: number): ProductView | null {
    const product = this.repository.findById(id);
    return product ? this.withDerivedAttrs(product) : null;
  }

  search(q: string): ProductView[] {
    return this.repository.search(q).map((p) => this.withDerivedAttrs(p));
  }

  // Listado con orden por precio (spec §6.12/Paso 12): sort ya normalizado por
  // el controller ("asc" | "desc"); cada producto sale como ProductView
  // completo (fallback de imagen §2.3 + inStock), igual que el resto de los
  // listados del sitio.
  findAllWithSort(sort?: "asc" | "desc"): ProductView[] {
    return this.repository.findAll(sort).map((p) => this.withDerivedAttrs(p));
  }

  // Buscador server-rendered (spec §6.13/Paso 12): resultados por nombre con
  // atributos derivados ya resueltos.
  searchByName(query: string): ProductView[] {
    return this.repository.searchByName(query).map((p) => this.withDerivedAttrs(p));
  }

  findByCategory(categoryId: number): ProductView[] {
    return this.repository.findByCategory(categoryId).map((p) => this.withDerivedAttrs(p));
  }

  // "Te puede interesar" (spec §6.6): primeros `limit` productos — la
  // selección aleatoria queda como BONUS del spec, no se implementa ahora.
  getSuggested(limit = 5): ProductView[] {
    return this.repository.list().slice(0, limit).map((p) => this.withDerivedAttrs(p));
  }

  // "Los más pedidos" (spec §6.7): hasta `limit` productos al azar — la tabla
  // no tiene is_featured, así que aplica el fallback del spec (aleatorio)
  getMostOrdered(limit = 10): ProductView[] {
    return this.repository.listRandom(limit).map((p) => this.withDerivedAttrs(p));
  }

  // Productos relacionados (spec §6.8/Paso 8): comparten al menos una
  // categoría con el producto dado, excluyéndolo; hasta `limit` resultados y,
  // si hay más candidatos, se eligen al azar. La selección aleatoria vive acá
  // (Fisher-Yates — el sort(() => Math.random() - 0.5) del pseudo-código del
  // spec es un barajado sesgado); el SQL queda en el repository. Cada related
  // sale como ProductView completo (fallback de imagen §2.3 + inStock §6.10).
  getRelated(productId: number, categories: Category[], limit = 4): ProductView[] {
    const categoryIds = categories.map((category) => category.id);
    if (categoryIds.length === 0) return [];
    const candidates = this.repository.findRelatedByCategories(categoryIds, productId);
    return shuffle(candidates)
      .slice(0, limit)
      .map((p) => this.withDerivedAttrs(p));
  }
}

// Barajado Fisher-Yates: uniforme y sin mutar el arreglo original.
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// withImageFallback (spec §2.3): producto de entrada → producto con image_url
// resuelta. Se aplica en TODO lugar donde se devuelven productos a una vista
// (home, listado, detalle, relacionados, sugeridos). El fallback se resuelve
// con fallbackImageUrl() — la URL de nube solo si hay credenciales reales.
export function withImageFallback(product: Product): Product & { image_url: string } {
  return {
    ...product,
    image_url: product.image_url?.trim() ? product.image_url : fallbackImageUrl(),
  };
}

export const productService = new ProductService();

export { isCloudinaryConfigured };
