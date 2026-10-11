import type { Request, Response } from "express";
import { orderService } from "../../services/order.service.js";
import { normalizeId } from "../../utils/normalizeId.js";

/**
 * @fileoverview Controller de la API de órdenes (spec §23.6): lista las
 * órdenes del usuario autenticado y sirve una orden con ownership. Handlers
 * finos: la lógica de acceso vive en `orderService` y el SQL en el repository.
 */

export const orderController = {
  /**
   * Lista las órdenes del usuario autenticado (spec §23.6).
   *
   * @swagger
   * /api/orders:
   *   get:
   *     summary: Órdenes del usuario
   *     description: Devuelve solo las órdenes del usuario autenticado.
   *     tags: [Órdenes]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Lista de órdenes del usuario (con sus items).
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express (requiere `req.user`).
   * @param {Response} res - Respuesta Express.
   * @returns {void}
   */
  list(req: Request, res: Response): void {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    res.json({ orders: orderService.listForUser(userId) });
  },

  /**
   * Devuelve una orden si el usuario es su dueño o admin (spec §23.6).
   *
   * @swagger
   * /api/orders/{id}:
   *   get:
   *     summary: Detalle de una orden
   *     description: Devuelve la orden si pertenece al usuario (o si es admin). 404 si no existe o es de otro usuario (no revela existencia).
   *     tags: [Órdenes]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Id numérico de la orden.
   *     responses:
   *       200:
   *         description: Orden con sus items.
   *       400:
   *         description: Id inválido (no numérico / <= 0).
   *       401:
   *         description: Token requerido o inválido.
   *       404:
   *         description: La orden no existe o no pertenece al usuario.
   *
   * @param {Request} req - Petición Express (requiere `req.params.id` y `req.user`).
   * @param {Response} res - Respuesta Express.
   * @returns {void}
   */
  getById(req: Request, res: Response): void {
    const raw = req.params.id;
    const id = normalizeId(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const found = orderService.getForUser(id, user);
    if (!found) {
      // 404 y no 403: no revelar que la orden existe (spec §23.6).
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(found);
  },
};
