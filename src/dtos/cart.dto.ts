import type { SessionCartItem } from "../models/cart.model.js";

// CartItemView: entrada de sesión cruzada con datos reales del producto
// (spec §6.4 — "Ver carrito combina sesión + datos reales del producto").
// imageUrl/inStock ya vienen resueltos por productService (ProductView),
// subtotal = price × quantity calculado con el precio de DB.
export interface CartItemView extends SessionCartItem {
  name: string;
  price: number;
  imageUrl: string;
  inStock: boolean;
  subtotal: number;
}

// CartView: lo que devuelven los endpoints /api/cart/* (JSON) y lo que
// recibe pages/cart.ejs en el render inicial.
export interface CartView {
  items: CartItemView[];
  total: number;
  count: number;
}
