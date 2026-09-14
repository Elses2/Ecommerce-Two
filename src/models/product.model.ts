// Modelo de la tabla products (spec §1.1); price REAL = número (decisión money model)
export interface Product {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  stock: number;
  price: number;
}
