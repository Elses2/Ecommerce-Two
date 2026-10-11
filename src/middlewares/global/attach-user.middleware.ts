import type { NextFunction, Request, Response } from "express";
import { authService } from "../../services/auth.service.js";
import { extractToken } from "../../utils/auth-cookie.js";

/**
 * @fileoverview Middleware global **blando** de identidad (spec §23.3,
 * enmienda cookie httpOnly): verifica el token (header `Authorization` o
 * cookie `auth_token`) y, si es válido, deja `req.user` y
 * `res.locals.user = { id, name, role }` para las vistas. Si falta o es
 * inválido, deja `null` y **no falla**: las páginas públicas siguen
 * funcionando y las protegidas deciden con `requirePageAuth`.
 *
 * Se monta como global (spec §22.3): aplica a (casi) todas las peticiones
 * sin depender del endpoint, justo después de `baseMiddlewares` para que
 * `req.cookies` ya esté parseado.
 */

/**
 * Resuelve la identidad del usuario si el token es válido (nunca falla).
 *
 * @param {Request} req - Petición Express (lee cookie/header vía `extractToken`).
 * @param {Response} res - Respuesta Express (se le escribe `res.locals.user`).
 * @param {NextFunction} next - Siguiente middleware/router.
 * @returns {void}
 */
export function attachUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  const identity = token ? authService.verifyToken(token) : null;
  const user =
    identity === null
      ? null
      : { id: identity.sub, name: identity.name ?? "", role: identity.role };
  if (user) req.user = { id: user.id, role: user.role };
  res.locals.user = user;
  next();
}