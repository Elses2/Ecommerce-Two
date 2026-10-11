import type { NextFunction, Request, Response } from "express";
import { authService } from "../../services/auth.service.js";

/**
 * @fileoverview Middleware de ruta que exige un JWT válido (spec §23.3). Vive
 * en `middlewares/route/` porque solo aplica a rutas concretas: se encadena
 * antes del controller (`router.get("/me", authenticate, controller.me)`).
 *
 * Responde 401 con el mismo formato JSON de error de la API
 * (`{ error: "..." }`, ver `error-handler.middleware.ts`) cuando falta el
 * header, el token es inválido o expiró. En éxito deja `req.user`
 * (`{ id, role }`) para el controller y para `authorize`.
 */

/**
 * Verifica `Authorization: Bearer <jwt>` y deja `req.user` (spec §23.3).
 *
 * @param {Request} req - Petición Express (lee `req.headers.authorization`).
 * @param {Response} res - Respuesta Express.
 * @param {NextFunction} next - Siguiente middleware/controller.
 * @returns {void} Responde 401 si el token falta, es inválido o expiró.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  const payload = authService.verifyToken(
    header.slice("Bearer ".length).trim(),
  );
  if (!payload) {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
}
