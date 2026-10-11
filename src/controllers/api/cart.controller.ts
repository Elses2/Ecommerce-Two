import type { Request, Response } from "express";
import { cartService } from "../../services/cart.service.js";
import { productService } from "../../services/product.service.js";

/**
 * @fileoverview Controller de la API del carrito (spec §6.4/§24): handlers
 * finos que llaman a `cartService` (Redis) y responden JSON con el carrito ya
 * recalculado (`{ items, total, count }`). Todas las rutas exigen JWT
 * (`authenticate`): la clave del carrito es el `userId` del token.
 */

/**
 * Parsea y valida el parámetro de ID del producto.
 *
 * @param {string | string[] | undefined} raw - Valor de `req.params.productId`.
 * @returns {number | null} Id entero positivo, o `null` si no es válido.
 */
function parseProductId(raw: string | string[] | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const cartController = {
  /**
   * Devuelve el carrito del usuario (carga inicial + contador del header).
   *
   * @swagger
   * /api/cart:
   *   get:
   *     summary: Carrito del usuario
   *     description: Devuelve el carrito del usuario autenticado con precios recalculados.
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Carrito actual.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Cart'
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express (requiere `req.user`).
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async getCart(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    res.json(await cartService.getCartWithDetails(userId));
  },

  /**
   * Agrega un producto al carrito.
   *
   * @swagger
   * /api/cart/add/{productId}:
   *   post:
   *     summary: Agregar item al carrito
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: productId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Carrito actualizado.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Cart'
   *       400:
   *         description: ID inválido o producto sin stock.
   *       401:
   *         description: Token requerido o inválido.
   *       404:
   *         description: Producto no encontrado.
   *
   * @param {Request} req - Petición Express.
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async addItem(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const product = productService.findById(productId);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (!product.inStock) {
      res.status(400).json({ error: "Product out of stock" });
      return;
    }
    await cartService.addItem(userId, productId);
    res.json(await cartService.getCartWithDetails(userId));
  },

  /**
   * Incrementa en una unidad la cantidad de un producto.
   *
   * @swagger
   * /api/cart/increase/{productId}:
   *   patch:
   *     summary: Incrementar cantidad de item
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: productId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Carrito actualizado.
   *       400:
   *         description: ID inválido.
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express.
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async increaseItem(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await cartService.updateQuantity(userId, productId, +1);
    res.json(await cartService.getCartWithDetails(userId));
  },

  /**
   * Decrementa en una unidad la cantidad de un producto.
   *
   * @swagger
   * /api/cart/decrease/{productId}:
   *   patch:
   *     summary: Decrementar cantidad de item
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: productId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Carrito actualizado.
   *       400:
   *         description: ID inválido.
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express.
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async decreaseItem(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await cartService.updateQuantity(userId, productId, -1);
    res.json(await cartService.getCartWithDetails(userId));
  },

  /**
   * Remueve un producto del carrito.
   *
   * @swagger
   * /api/cart/remove/{productId}:
   *   delete:
   *     summary: Eliminar item del carrito
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: productId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Carrito actualizado.
   *       400:
   *         description: ID inválido.
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express.
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async removeItem(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await cartService.removeItem(userId, productId);
    res.json(await cartService.getCartWithDetails(userId));
  },

  /**
   * Vacía el carrito del usuario.
   *
   * @swagger
   * /api/cart/clear:
   *   delete:
   *     summary: Vaciar carrito
   *     tags: [Carrito]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Carrito vacío.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Cart'
   *       401:
   *         description: Token requerido o inválido.
   *
   * @param {Request} req - Petición Express.
   * @param {Response} res - Respuesta Express.
   * @returns {Promise<void>}
   */
  async clearCart(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (userId === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    await cartService.clear(userId);
    res.json(await cartService.getCartWithDetails(userId));
  },
};
