import type { SessionData } from "express-session";
import type { SessionCartItem } from "../models/cart.model.js";
import type { CartItemView, CartView } from "../dtos/cart.dto.js";
import { productService } from "./product.service.js";

// Servicio PURO del carrito (spec §6.4): muta req.session.cart y lee productos
// vía productService; sin SQL acá. El repositorio es síncrono (better-sqlite3,
// D5), así que las firmas son síncronas — sin promesas falsas.
export class CartService {
  // Agrega 1 unidad del producto; si ya está en el carrito incrementa.
  // La validación de existencia/stock vive en el controller (spec §6.10:
  // "el controller de POST /cart/add/:productId también debe rechazar").
  addItem(session: SessionData, productId: number): void {
    const cart: SessionCartItem[] = session.cart ?? [];
    const existing = cart.find((i) => i.productId === productId);
    if (existing) existing.quantity += 1;
    else cart.push({ productId, quantity: 1 });
    session.cart = cart;
  }

  // Delta de cantidad (spec §6.4): +1 / -1; en 0 o menos se elimina el ítem.
  // Si el producto no está en el carrito, no hace nada (comportamiento del spec).
  updateQuantity(session: SessionData, productId: number, delta: number): void {
    const cart: SessionCartItem[] = session.cart ?? [];
    const item = cart.find((i) => i.productId === productId);
    if (!item) return;
    item.quantity += delta;
    session.cart =
      item.quantity <= 0 ? cart.filter((i) => i.productId !== productId) : cart;
  }

  removeItem(session: SessionData, productId: number): void {
    const cart: SessionCartItem[] = session.cart ?? [];
    session.cart = cart.filter((i) => i.productId !== productId);
  }

  clear(session: SessionData): void {
    session.cart = [];
  }

  // Combina sesión + datos reales (spec §6.4): el precio SIEMPRE viene de la
  // DB vía productService (ProductView con imageUrl/inStock resueltos) — la
  // sesión no guarda precios. total = Σ price × quantity; count = Σ quantity.
  // productIds huérfanos en sesión (producto borrado de la DB): §6.4 no dice
  // qué hacer — decisión: se descartan de la respuesta Y de la sesión
  // (self-healing) en lugar de romper el render con un undefined.
  getCartWithDetails(session: SessionData): CartView {
    const cart: SessionCartItem[] = session.cart ?? [];
    const items: CartItemView[] = [];
    const kept: SessionCartItem[] = [];
    for (const entry of cart) {
      const product = productService.getById(entry.productId);
      if (!product) continue;
      kept.push(entry);
      items.push({
        productId: entry.productId,
        quantity: entry.quantity,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        inStock: product.inStock,
        subtotal: product.price * entry.quantity,
      });
    }
    if (kept.length !== cart.length) session.cart = kept;

    const total = items.reduce((sum, i) => sum + i.subtotal, 0);
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    return { items, total, count };
  }
}

export const cartService = new CartService();
