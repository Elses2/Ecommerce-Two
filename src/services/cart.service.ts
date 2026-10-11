import type { CartItemView, CartView } from "../dtos/cart.dto.js";
import type { OrderLineInput } from "../repositories/order.repository.js";
import { cartRepository } from "../repositories/cart.repository.js";
import { productService } from "./product.service.js";

/**
 * @fileoverview Servicio PURO del carrito (spec §6.4/§24): manipula el carrito
 * de un usuario en Redis y resuelve precios/stock vía `productService`. No
 * conoce Express ni SQL (regla del §0). Ahora es asíncrono porque Redis lo es;
 * los precios y subtotales SIEMPRE se recalculan desde SQLite (Redis nunca
 * guarda precios).
 */
export class CartService {
  /**
   * Agrega 1 unidad del producto (el controller valida existencia/stock, §6.10).
   *
   * @param {number} userId - Id del usuario (del JWT).
   * @param {number} productId - Id del producto.
   * @returns {Promise<void>}
   */
  async addItem(userId: number, productId: number): Promise<void> {
    await cartRepository.increment(userId, productId, +1);
  }

  /**
   * Ajusta la cantidad en `delta` (+1 / -1). Conserva la semántica previa: si
   * el producto no está en el carrito, no hace nada (spec §6.4).
   *
   * @param {number} userId - Id del usuario.
   * @param {number} productId - Id del producto.
   * @param {number} delta - +1 o -1.
   * @returns {Promise<void>}
   */
  async updateQuantity(
    userId: number,
    productId: number,
    delta: number,
  ): Promise<void> {
    const current = await cartRepository.getAll(userId);
    if (!(String(productId) in current)) return;
    await cartRepository.increment(userId, productId, delta);
  }

  /**
   * Elimina un producto del carrito.
   *
   * @param {number} userId - Id del usuario.
   * @param {number} productId - Id del producto.
   * @returns {Promise<void>}
   */
  async removeItem(userId: number, productId: number): Promise<void> {
    await cartRepository.remove(userId, productId);
  }

  /**
   * Vacía el carrito del usuario.
   *
   * @param {number} userId - Id del usuario.
   * @returns {Promise<void>}
   */
  async clear(userId: number): Promise<void> {
    await cartRepository.clear(userId);
  }

  /**
   * Combina el carrito de Redis con datos reales de la DB (spec §6.4/§24):
   * `subtotal = price × quantity` con el precio SIEMPRE desde SQLite.
   * Productos huérfanos (borrados de la DB) se descartan y se limpian de Redis
   * (self-healing, igual que antes).
   *
   * @param {number} userId - Id del usuario.
   * @returns {Promise<CartView>} `{ items, total, count }`.
   */
  async getCartWithDetails(userId: number): Promise<CartView> {
    const raw = await cartRepository.getAll(userId);
    const items: CartItemView[] = [];
    for (const [key, quantityRaw] of Object.entries(raw)) {
      const productId = Number(key);
      const quantity = Number(quantityRaw);
      const product = productService.findById(productId);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) {
        await cartRepository.remove(userId, productId);
        continue;
      }
      items.push({
        productId,
        quantity,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        inStock: product.inStock,
        subtotal: product.price * quantity,
      });
    }

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return { items, total, count };
  }

  /**
   * Devuelve las líneas del carrito para el checkout (Redis, fuera de la
   * transacción SQLite — spec §24/D1).
   *
   * @param {number} userId - Id del usuario.
   * @returns {Promise<OrderLineInput[]>} Líneas `{ productId, quantity }`.
   */
  async getLines(userId: number): Promise<OrderLineInput[]> {
    const cart = await this.getCartWithDetails(userId);
    return cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
  }
}

/** Instancia singleton de `CartService`. */
export const cartService = new CartService();
