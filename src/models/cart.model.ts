/**
 * @fileoverview Modelo del carrito en Redis (spec §24): Redis guarda SOLO ids y
 * cantidades — nunca el producto completo ni el precio (los totales se
 * recalculan siempre desde SQLite en `cart.service.getCartWithDetails`).
 */
export interface CartEntry {
  productId: number;
  quantity: number;
}
