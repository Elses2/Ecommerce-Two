import { isCloudinaryConfigured } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { ProductRepository, productRepository } from "../repositories/product.repository.js";
import type { ProductView } from "../dtos/product.dto.js";
import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";

// Fallback de imagen (spec §2.3): local mientras Cloudinary no esté configurado;
// una vez configurado, el fallback vive en la carpeta de Cloudinary (D7)
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
    return {
      ...product,
      categories: this.repository.findCategoriesByProduct(product.id),
      inStock: product.stock > 0,
      imageUrl: withImageFallback(product.image_url),
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
}

// withImageFallback (spec §2.3): en TODO lugar donde se resuelve la imagen del producto
export function withImageFallback(imageUrl: string | null): string {
  const set = imageUrl !== null && imageUrl.trim() !== "";
  return set ? (imageUrl as string) : fallbackImageUrl();
}

export const productService = new ProductService();

export { isCloudinaryConfigured };
