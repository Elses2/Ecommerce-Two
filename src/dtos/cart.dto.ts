import type { CartEntry } from "../models/cart.model.js";

/**
 * @fileoverview DTOs del carrito (spec §6.4/§24): forma pública de un ítem y
 * del carrito completo. `CartItemView` cruza Redis (id + cantidad) con datos
 * reales del producto resueltos por `productService`; `subtotal` usa el precio
 * de la DB, nunca uno guardado en el carrito.
 */
export interface CartItemView extends CartEntry {
  name: string;
  price: number;
  imageUrl: string;
  inStock: boolean;
  subtotal: number;
}

/**
 * Vista del carrito: lo que devuelven los endpoints `/api/cart/*` (JSON).
 */
export interface CartView {
  items: CartItemView[];
  total: number;
  count: number;
}
