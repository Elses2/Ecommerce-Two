import type { Request, Response } from "express";
import { checkoutService } from "../../services/checkout.service.js";

/**
 * @fileoverview Controller de páginas del checkout (spec §19/§24).
 *
 * `GET /checkout` renderiza el cascarón del formulario: sin cookies el servidor
 * no conoce el carrito, así que `checkout.js` pide `GET /api/checkout` (token +
 * resumen) y envía el form por `fetch` a `POST /api/checkout`.
 *
 * `GET /checkout/confirmation/:token` sigue siendo SSR y **público**: el token
 * de 128 bits es la credencial (D7).
 */

// Formato del token de idempotencia (spec §19): 32 hex [a-f0-9]. Es el mismo
// patrón que valida el service; acá se usa como puerta 404 de confirmación (D7).
const CHECKOUT_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Controller de páginas del checkout (spec §19/§24).
 */
export const checkoutController = {
  /**
   * Renderiza el cascarón del formulario de checkout.
   *
   * @swagger
   * /checkout:
   *   get:
   *     summary: Cascarón del formulario de checkout
   *     description: Renderiza el formulario; el resumen y el token los carga `checkout.js` por `GET /api/checkout`.
   *     tags: [Páginas]
   *     responses:
   *       200:
   *         description: Página HTML del formulario de checkout.
   *
   * @param {Request} _req - Objeto de solicitud de Express.
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  showCheckout(_req: Request, res: Response): void {
    res.render("templates/pages/checkout", {
      title: "Checkout",
      checkoutToken: "",
      values: {},
      errors: [],
      cart: { items: [], total: 0, count: 0 },
    });
  },

  /**
   * Renderiza la confirmación de una orden por su token de checkout (D7).
   *
   * El token identifica la orden (nunca se expone `orders.id`): formato
   * inválido u orden inexistente → 404.
   *
   * @swagger
   * /checkout/confirmation/{token}:
   *   get:
   *     summary: Confirmación de orden
   *     description: Renderiza la confirmación de la orden creada, buscada por su token de checkout.
   *     tags: [Páginas]
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *         description: Token de checkout de la orden (32 hex).
   *     responses:
   *       200:
   *         description: Página HTML de confirmación de la orden.
   *       404:
   *         description: Token malformado u orden inexistente.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.token`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  showConfirmation(req: Request, res: Response): void {
    const raw = req.params.token;
    const token = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
    if (!CHECKOUT_TOKEN_PATTERN.test(token)) {
      res
        .status(404)
        .render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    const data = checkoutService.getOrderForConfirmation(token);
    if (!data) {
      res
        .status(404)
        .render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    res.render("templates/pages/order-confirmation", {
      title: "Orden confirmada",
      order: data.order,
      items: data.items,
    });
  },
};
