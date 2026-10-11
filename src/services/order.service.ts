import type { Order } from "../models/order.model.js";
import type { Role } from "../models/user.model.js";
import {
  orderRepository,
  type OrderItemWithProduct,
} from "../repositories/order.repository.js";

/**
 * @fileoverview Servicio de órdenes (spec §23.6): autorización **por propiedad**
 * es regla de negocio y vive acá (no en un middleware genérico). No conoce
 * Express ni SQL (regla del §0); delega en `orderRepository`.
 */

/**
 * Una orden con sus items (unit_price congelado, spec §1.1).
 */
export interface OrderWithItems {
  order: Order;
  items: OrderItemWithProduct[];
}

export class OrderService {
  /**
   * Lista las órdenes del usuario autenticado (spec §23.6). Cierra el «sin
   * historial de compras» del §19.8.
   *
   * @param {number} userId - Id del usuario dueño.
   * @returns {OrderWithItems[]} Órdenes del usuario con sus items.
   */
  listForUser(userId: number): OrderWithItems[] {
    return orderRepository.findByUserId(userId).map((order) => ({
      order,
      items: orderRepository.findItemsByOrderId(order.id),
    }));
  }

  /**
   * Devuelve la orden si el usuario es su dueño o es admin (spec §23.6).
   *
   * Si la orden no existe o pertenece a otro usuario, devuelve `null`: el
   * controller responde **404**, nunca 403, para no revelar que la orden existe.
   *
   * @param {number} orderId - Id de la orden pedida.
   * @param {{ id: number; role: Role }} user - Usuario autenticado (de `req.user`).
   * @returns {OrderWithItems | null} La orden con items, o `null` si no hay acceso.
   */
  getForUser(
    orderId: number,
    user: { id: number; role: Role },
  ): OrderWithItems | null {
    const order = orderRepository.findById(orderId);
    if (!order || (order.user_id !== user.id && user.role !== "admin")) {
      return null;
    }
    return { order, items: orderRepository.findItemsByOrderId(order.id) };
  }
}

/** Instancia singleton de `OrderService` (convención del §0). */
export const orderService = new OrderService();
