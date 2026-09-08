import { categoryRepository } from "../repositories/category.repository.js";
import type { Category } from "../models/category.model.js";

// Pure service (spec §6.6b): returns rows { id, name, description } as-is.
// The icon is a view-side concern — resolved by utils/category-icons.ts,
// never here.
export const categoryService = {
  findAll(): Category[] {
    return categoryRepository.findAll();
  },
};
