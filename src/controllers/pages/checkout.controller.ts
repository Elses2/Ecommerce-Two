import type { Request, Response } from "express";
import type { CheckoutRequestDto, PaymentMethod } from "../../dtos/checkout.dto.js";
import type { OrderLineInput } from "../../repositories/order.repository.js";
import { checkoutService } from "../../services/checkout.service.js";
import { cartService } from "../../services/cart.service.js";

// Controller de páginas del checkout (spec §19): GET /checkout arma el
// formulario con el token de idempotencia (D6), POST /checkout crea la orden
// atómicamente y GET /checkout/confirmation/:token muestra la orden creada.
// Las líneas del carrito SIEMPRE salen de la sesión (spec §6.4) — el body del
// formulario jamás aporta productos.

// Formato del token de idempotencia (spec §19): 32 hex [a-f0-9]. Es el mismo
// patrón que valida el service; acá se usa como puerta 404 de confirmación
// (D7) para no consultar la DB con tokens malformados.
const CHECKOUT_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Lee un campo del body como string.
 *
 * El body de Express puede ser `undefined` o traer valores no-string; la
 * validación del service se encarga de rechazarlos, así que acá solo se
 * normaliza a string (vacío si no aplica).
 *
 * @param {unknown} body - Objeto del body parseado por express.urlencoded.
 * @param {string} field - Nombre del campo del formulario.
 * @returns {string} El valor del campo, o `""` si no es un string.
 */
function bodyString(body: unknown, field: string): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/**
 * Controller de páginas del checkout (spec §19).
 */
export const checkoutController = {
  /**
   * Renderiza el formulario de checkout con el resumen del carrito.
   *
   * Genera un `checkoutToken` nuevo por render (D6): el formulario lo devuelve
   * oculto en el POST y, si el envío falla por validación, se re-renderiza con
   * el MISMO token para que un reintento exitoso no cree órdenes duplicadas.
   * Carrito vacío → redirect a /cart (no hay nada que pagar).
   *
   * @swagger
   * /checkout:
   *   get:
   *     summary: Formulario de checkout
   *     description: Renderiza el formulario de envío/pago con el resumen del carrito de la sesión.
   *     tags: [Páginas]
   *     responses:
   *       200:
   *         description: Página HTML del formulario de checkout.
   *       302:
   *         description: Carrito vacío — redirige a /cart.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  showCheckout(req: Request, res: Response): void {
    const cart = cartService.getCartWithDetails(req.session);
    if (cart.items.length === 0) {
      res.redirect("/cart");
      return;
    }
    res.render("templates/pages/checkout", {
      title: "Checkout",
      cart,
      checkoutToken: checkoutService.generateCheckoutToken(),
      values: {},
      errors: [],
    });
  },

  /**
   * Procesa el formulario de checkout y crea la orden.
   *
   * El DTO se arma SOLO con los campos esperados del body (nunca con las
   * líneas del carrito: esas salen de la sesión). Si la orden se crea (o es un
   * reenvío idempotente del mismo token, D6) se vacía el carrito y se redirige
   * a la confirmación; si falla la validación se re-renderiza el formulario
   * con status 400, los errores, los valores tipeados y el MISMO token — el
   * carrito de la sesión queda intacto.
   *
   * @swagger
   * /checkout:
   *   post:
   *     summary: Procesar checkout
   *     description: Crea la orden atómicamente (orden + items + stock) a partir del carrito de la sesión. Idempotente por checkout_token (D6).
   *     tags: [Páginas]
   *     requestBody:
   *       required: true
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             type: object
   *             properties:
   *               firstName:
   *                 type: string
   *               lastName:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               phone:
   *                 type: string
   *               address:
   *                 type: string
   *               city:
   *                 type: string
   *               postalCode:
   *                 type: string
   *               country:
   *                 type: string
   *               paymentMethod:
   *                 type: string
   *                 enum: [transfer, cash_on_delivery, card]
   *               checkoutToken:
   *                 type: string
   *                 description: Token de idempotencia generado por el GET /checkout.
   *     responses:
   *       302:
   *         description: Orden creada — redirige a /checkout/confirmation/{token}.
   *       400:
   *         description: Errores de validación — re-render del formulario con los errores.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.body` y `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  submitCheckout(req: Request, res: Response): void {
    const body = req.body;
    // DTO solo con campos esperados (spec §19): el body nunca aporta productos.
    const dto: CheckoutRequestDto = {
      firstName: bodyString(body, "firstName"),
      lastName: bodyString(body, "lastName"),
      email: bodyString(body, "email"),
      phone: bodyString(body, "phone"),
      address: bodyString(body, "address"),
      city: bodyString(body, "city"),
      postalCode: bodyString(body, "postalCode"),
      country: bodyString(body, "country"),
      // El cast es deliberado: la pertenencia a la lista permitida (D9) la
      // valida el service (validateCheckoutInput).
      paymentMethod: bodyString(body, "paymentMethod") as PaymentMethod,
      checkoutToken: bodyString(body, "checkoutToken"),
    };

    // Líneas SIEMPRE desde la sesión (spec §6.4), con self-healing de
    // productos huérfanos que ya aplica getCartWithDetails.
    const cart = cartService.getCartWithDetails(req.session);
    const lines: OrderLineInput[] = cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    const result = checkoutService.createOrder(lines, dto);
    if (result.ok) {
      cartService.clear(req.session); // el carrito se vacía SOLO si la orden se creó (spec §19)
      res.redirect(`/checkout/confirmation/${result.orderToken}`);
      return;
    }

    // Validación fallida: re-render con el MISMO token (D6), carrito intacto.
    res.status(400).render("templates/pages/checkout", {
      title: "Checkout",
      cart,
      checkoutToken: dto.checkoutToken,
      values: dto,
      errors: result.errors,
    });
  },

  /**
   * Renderiza la confirmación de una orden por su token de checkout (D7).
   *
   * El token identifica la orden (nunca se expone `orders.id`): formato
   * inválido u orden inexistente → 404. La vista muestra los items con el
   * `unit_price` congelado (spec §1.1) y los datos de envío de la orden.
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
    // @types/express 5 tipa params como string | string[] — misma defensa que
    // los demás controllers de páginas.
    const raw = req.params.token;
    const token = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
    if (!CHECKOUT_TOKEN_PATTERN.test(token)) {
      res.status(404).render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    const data = checkoutService.getOrderForConfirmation(token);
    if (!data) {
      res.status(404).render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    res.render("templates/pages/order-confirmation", {
      title: "Orden confirmada",
      order: data.order,
      items: data.items,
    });
  },
};
