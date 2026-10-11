import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../models/user.model.js";

/**
 * @fileoverview Middleware de ruta de autorización por rol (spec §23.6). La
 * autenticación responde «¿quién sos?» (401) y la autorización «¿podés hacer
 * esto?» (403). Se encadena después de `authenticate`:
 * `router.post("/products", authenticate, authorize("admin"), controller.create)`.
 *
 * Hoy no hay endpoints de administración; queda cubierto por tests y listo
 * para cuando existan (p. ej. alta de productos).
 */

/**
 * Fábrica que exige que `req.user.role` esté entre los roles permitidos.
 *
 * @param {...Role} roles - Roles con permiso (al menos uno).
 * @returns {import("express").RequestHandler} Middleware listo para encadenar.
 */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    next();
  };
