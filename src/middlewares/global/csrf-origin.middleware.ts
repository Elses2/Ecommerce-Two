import type { NextFunction, Request, Response } from "express";

/**
 * @fileoverview Middleware global de protección CSRF (spec §23.5, enmienda
 * cookie httpOnly). Con cookie `SameSite=Lax` el navegador ya no manda la
 * cookie en POST cross-site (bloquea la mayoría de los ataques), pero un GET
 * ajeno sí la manda: por eso **ningún GET puede tener efectos secundarios**
 * (hoy no los tiene). Este middleware bloquea mutaciones con origen ajeno:
 * compara `Origin` contra el `Host` real y, si no hay `Origin`, rechaza
 * `Sec-Fetch-Site: cross-site`. Sin `Origin` ni `Sec-Fetch-Site` (curl,
 * tests, clientes no navegador) deja pasar (C4, sin librería de tokens CSRF).
 */

// Métodos sin efectos secundarios: nunca se bloquean (C4).
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Bloquea mutaciones con origen ajeno (C4). `GET`/`HEAD`/`OPTIONS` pasan
 * siempre.
 *
 * @param {Request} req - Petición Express (lee `req.method`, `origin` y `sec-fetch-site`).
 * @param {Response} res - Respuesta Express (403 JSON si el origen es ajeno).
 * @param {NextFunction} next - Siguiente middleware/router.
 * @returns {void}
 */
export function csrfOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.get("host");
    } catch {
      /* Origin malformado cae al 403 */
    }
    if (!sameHost) {
      res.status(403).json({ error: "Origen no permitido" });
      return;
    }
  } else if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }

  // Sin Origin ni Sec-Fetch-Site: cliente no navegador (curl, tests).
  next();
}