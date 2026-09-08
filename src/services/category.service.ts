import { categoryRepository } from "../repositories/category.repository.js";
import type { Category } from "../models/category.model.js";

// Pure service (spec §6.6b): returns rows { id, name, description } as-is.
// The icon is a view-side concern — resolved by utils/category-icons.ts,
// never here.
export const categoryService = {
  findAll(): Category[] {
    return categoryRepository.findAll();
  },

  // Búsqueda por id (spec §4.6/Paso 11): nombre/título para la página de
  // categoría. null replica el contrato de productService.findById (§6.8) —
  // el controller responde 404 cuando vuelve vacío (§6.9: la existencia se
  // resuelve en el controller tras consultar el repository).
  findById(id: number): Category | null {
    return categoryRepository.findById(id) ?? null;
  },
};
