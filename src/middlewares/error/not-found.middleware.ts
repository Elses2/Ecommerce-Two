import type { Request, Response } from "express";

/**
 * @fileoverview Middleware terminal de recurso no encontrado (spec §6.1).
 * Antes era el `handleNotFound` inline de `app.ts`; se extrajo a
 * `middlewares/error/` sin cambiar su lógica (Fase 3 del refactor, issue #91).
 * Debe montarse DESPUÉS de todas las rutas y ANTES del `errorHandler`.
 */

/**
 * Middleware catch-all de recurso no encontrado (spec §6.1):
 * Se ejecuta después de evaluar todas las rutas registradas.
 * Responde con un objeto JSON para `/api/*` y renderiza la vista 404 para el resto.
 *
 * @param {Request} req - Objeto de solicitud HTTP de Express.
 * @param {Response} res - Objeto de respuesta HTTP de Express.
 * @returns {void}
 */
export function notFound(req: Request, res: Response): void {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res
    .status(404)
    .render("templates/pages/404", { title: "Página no encontrada" });
}
