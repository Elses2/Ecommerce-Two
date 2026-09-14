import type { Category } from "../models/category.model.js";
import type { Product } from "../models/product.model.js";

// ProductView: lo que recibe la vista — producto + categorías N:M + atributos derivados
export interface ProductView extends Product {
  categories: Category[];
  inStock: boolean;
  imageUrl: string;
}
