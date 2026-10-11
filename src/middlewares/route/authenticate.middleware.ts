import type { NextFunction, Request, Response } from "express";
import { authService } from "../../services/auth.service.js";
import { extractToken } from "../../utils/auth-cookie.js";

/**
 * @fileoverview Middleware de ruta que exige un JWT válido (spec §23.3,
 * enmienda cookie httpOnly). Vive en `middlewares/route/` porque solo aplica
 * a rutas concretas: se encadena antes del controller (`router.get("/me",
 * authenticate, controller.me)`).
 *
 * Sigue siendo estricto y autosuficiente (401 JSON): no depende de
 * `attachUser`. El token se lee con `extractToken` (C3): header
 * `Authorization: Bearer` si viene, si no la cookie `auth_token`. Responde
 * 401 cuando falta el token, es inválido o expiró. En éxito deja `req.user`
 * (`{ id, role }`) para el controller y para `authorize`.
 */

/**
 * Verifica el JWT (header o cookie) y deja `req.user` (spec §23.3).
 *
 * @param {Request} req - Petición Express (lee header/cookie vía `extractToken`).
 * @param {Response} res - Respuesta Express.
 * @param {NextFunction} next - Siguiente middleware/controller.
 * @returns {void} Responde 401 si el token falta, es inválido o expiró.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
}
