// Modelo de la tabla product_categories: join N:M con PK compuesta (spec §1.1)
export interface ProductCategory {
  product_id: number;
  category_id: number;
}
