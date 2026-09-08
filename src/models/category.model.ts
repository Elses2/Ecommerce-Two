// Modelo de la tabla categories (spec §1.1)
export interface Category {
  id: number;
  name: string;
  description: string | null;
}
