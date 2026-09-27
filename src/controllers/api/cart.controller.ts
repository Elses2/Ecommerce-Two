import type { Request, Response } from "express";
import { cartService } from "../../services/cart.service.js";
import { productService } from "../../services/product.service.js";

/**
 * Parsea y valida el parámetro de ID del producto enviado en las peticiones HTTP.
 *
 * // §6.9: id no numérico → 400. El middleware normalizeId solo cubre rutas
 * // /api/{recurso}/:id — las de carrito son /api/cart/{verbo}/:productId y se
 * // validan acá (el segmento "clear" es estático, no un id).
 *
 * @param {string | string[] | undefined} raw - Valor obtenido de `req.params.productId`.
 * @returns {number | null} Retorna el ID numérico entero positivo o `null` si no es válido.
 */
function parseProductId(raw: string | string[] | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Controller de API del carrito (spec §6.4): handlers finos que llaman al
 * cartService y responden JSON con el carrito ya recalculado
 * ({ items, total, count }) para que el frontend no pida nada aparte.
 */
export const cartController = {
  /**
   * Agrega un producto al carrito de compras de la sesión actual.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.productId` y `req.session`).
   * @param {Response} res - Objeto de respuesta de Express para enviar el estado del carrito o mensaje de error.
   * @returns {void}
   */
  addItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Existencia → 404 (§6.9) y stock → rechazo con mensaje (§6.10), ambos
    // ANTES de mutar la sesión.
    const product = productService.findById(productId);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (!product.inStock) {
      res.status(400).json({ error: "Product out of stock" });
      return;
    }
    cartService.addItem(req.session, productId);
    res.json(cartService.getCartWithDetails(req.session));
  },

  /**
   * Incrementa en una unidad la cantidad de un producto en el carrito.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.productId` y `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  increaseItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.updateQuantity(req.session, productId, +1);
    res.json(cartService.getCartWithDetails(req.session));
  },

  /**
   * Decrementa en una unidad la cantidad de un producto en el carrito.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.productId` y `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  decreaseItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.updateQuantity(req.session, productId, -1);
    res.json(cartService.getCartWithDetails(req.session));
  },

  /**
   * Remueve por completo un producto del carrito sin importar su cantidad.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.productId` y `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  removeItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.removeItem(req.session, productId);
    res.json(cartService.getCartWithDetails(req.session));
  },

  /**
   * Vacía totalmente todos los items contenidos en el carrito de la sesión.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.session`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  clearCart(req: Request, res: Response): void {
    cartService.clear(req.session);
    res.json(cartService.getCartWithDetails(req.session));
  },
};