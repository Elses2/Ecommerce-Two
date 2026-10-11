import type { NextFunction, Request, Response } from "express";

/**
 * @fileoverview Middleware de ruta que protege páginas con sesión (spec
 * §23.3, enmienda cookie httpOnly). Vive en `middlewares/route/` porque solo
 * aplica a páginas concretas (hoy `/cart` y `/checkout`, spec §24.3).
 *
 * Depende de `attachUser` (global, blando): si `req.user` quedó seteado, la
 * página sigue; si no, responde **302** a `/login?next=<req.originalUrl
 * codificado>` (sin parpadeo: la redirección es del servidor).
 */

/**
 * Redirige a `/login?next=...` si no hay usuario autenticado (302).
 *
 * @param {Request} req - Petición Express (lee `req.user` de `attachUser`).
 * @param {Response} res - Respuesta Express (302 a `/login`).
 * @param {NextFunction} next - Siguiente middleware/controller.
 * @returns {void}
 */
export function requirePageAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    const nextPath = encodeURIComponent(req.originalUrl || "/");
    res.redirect(`/login?next=${nextPath}`);
    return;
  }
  next();
}