import type { NextFunction, Request, Response } from "express";

/**
 * Middleware que calcula la cantidad total de productos en el carrito de sesión y la inyecta en `res.locals`.
 *
 * // injectCartCount (spec §6.11): suma quantity (no subtotales) del carrito de
 * // sesión en cada request y lo expone a las vistas vía res.locals. Requiere
 * // que express-session esté montado ANTES en app.ts. En /cart el contador
 * // además se actualiza inline con el JSON de /api/cart/* (data-cart-count).
 *
 * @param {Request} req - Objeto de solicitud de Express (requiere `req.session`).
 * @param {Response} res - Objeto de respuesta de Express donde se asigna `res.locals.cartCount`.
 * @param {NextFunction} next - Función para transferir el control al siguiente middleware o router.
 * @returns {void}
 */
export function injectCartCount(req: Request, res: Response, next: NextFunction): void {
  const cart = req.session.cart ?? [];
  res.locals.cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  next();
}
