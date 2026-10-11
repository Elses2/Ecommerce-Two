import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * @fileoverview Cookie de autenticación (spec §23.1, enmienda cookie httpOnly).
 * El JWT viaja en una cookie `httpOnly` (`SameSite=Lax`, `Secure` según
 * `COOKIE_SECURE`); el servidor sigue siendo stateless: la cookie es solo el
 * medio de transporte, no guarda nada. `Authorization: Bearer` sigue aceptado
 * (C3): sirve para curl, tests y un futuro cliente móvil.
 */

// Nombre de la cookie de autenticación (C1): `httpOnly`, `SameSite=Lax`,
// `Path=/`. Sin prefijo `__Host-` porque exige `Secure` y en desarrollo se
// sirve por HTTP.
export const AUTH_COOKIE = "auth_token";

/**
 * Atributos base de la cookie (C1). Se devuelven frescos en cada llamada para
 * que el navegador los compare exactos al borrar (mismos atributos o no la
 * quita).
 *
 * @returns {{ httpOnly: true; sameSite: "lax"; secure: boolean; path: "/" }}
 * Atributos de la cookie.
 */
function baseOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
  };
}

/**
 * Pone la cookie con el JWT (C2). La duración se deriva del `exp` del propio
 * token (C8): no se duplica la vida entre el JWT y la cookie.
 *
 * @param {Response} res - Respuesta Express (se le escribe `Set-Cookie`).
 * @param {string} token - JWT firmado por `authService.signToken`.
 * @returns {void}
 */
export function setAuthCookie(res: Response, token: string): void {
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  res.cookie(AUTH_COOKIE, token, {
    ...baseOptions(),
    ...(exp ? { maxAge: Math.max(exp * 1000 - Date.now(), 0) } : {}),
  });
}

/**
 * Borra la cookie de autenticación (C9). Usa exactamente los mismos atributos
 * con los que se creó, o el navegador conservaría la cookie.
 *
 * @param {Response} res - Respuesta Express (se le escribe `Set-Cookie`).
 * @returns {void}
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseOptions());
}

/**
 * Extrae el token de la petición (C3): header `Authorization: Bearer` si
 * viene; si no, la cookie `auth_token` (parseada por `cookieParser`).
 *
 * @param {Request} req - Petición Express (lee `headers.authorization` y `req.cookies`).
 * @returns {string | undefined} El JWT, o `undefined` si no viaja en ningún lado.
 */
export function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return req.cookies?.[AUTH_COOKIE];
}