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

  getById(id: number): ProductView | null {
    const product = this.repository.findById(id);
    return product ? this.withDerivedAttrs(product) : null;
  }

  search(q: string): ProductView[] {
    return this.repository.search(q).map((p) => this.withDerivedAttrs(p));
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
