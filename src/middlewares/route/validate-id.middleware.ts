import type { NextFunction, Request, RequestHandler, Response } from "express";
import { normalizeId } from "../../utils/normalizeId.js";

/**
 * @fileoverview Validación de ids de la API (spec §6.9). Vive en
 * `middlewares/route/` porque solo aplica a rutas concretas: no es un
 * middleware cross-cutting de todas las páginas.
 *
 * Expone dos piezas:
 * - `validateId(param)`: factory que se encadena en las rutas con `:id`/
 *   `:productId` (carrito) antes del controller. Usa el helper puro
 *   `normalizeId`, el mismo predicado que ya usaba `cart.controller`, así que
 *   el resultado es idéntico al anterior.
 * - `validateCollectionId`: guard de las colecciones `/api/{products,
 *   categories, orders}/:segmento` (issue #91).
 *
 * HALLAZGO (issue #91): el antiguo middleware global tenía un bug — su regex
 * capturaba el grupo 1 (el nombre de la colección) en vez del grupo 2 (el id)
 * — y por eso respondía **400 a TODA** ruta de un segmento bajo esas
 * colecciones, incluidos ids numéricos válidos (`/5`, `/999999`). Las rutas
 * `routes/api/{products,categories,orders}.routes.ts` están vacías, así que no
 * existe controller que resuelva el 404. Por decisión explícita del usuario
 * (issue #91) este PR es un refactor puro: `validateCollectionId` **preserva
 * ese comportamiento** y lo documenta como deuda; no se "arregla" acá.
 */

/**
 * Patrón de las rutas de colección con id: exactamente un segmento después de
 * `/api/{products|categories|orders}` (mismo patrón del middleware original).
 */
const COLLECTION_ID_PATH = /^\/api\/(products|categories|orders)\/([^/]+)$/;

/**
 * Guard de ids de las colecciones API.
 *
 * Paridad exacta con el middleware global original (issue #91): reproduce su
 * resultado observable, que es 400 `{"error":"Invalid id"}` para cualquier
 * request de exactamente un segmento bajo `/api/{products|categories|orders}`.
 * El bug de la regex original se conserva a propósito; ver el encabezado del
 * archivo.
 *
 * Se monta con `router.use(...)` en los routers de las tres colecciones, por lo
 * que solo corre para esos prefijos. `req.originalUrl` (sin query) es el path
 * completo — equivale al `req.path` que veía el middleware global.
 *
 * @param {Request} req - Objeto de solicitud de Express.
 * @param {Response} res - Objeto de respuesta de Express.
 * @param {NextFunction} next - Función para continuar hacia el siguiente middleware o controller.
 * @returns {void}
 */
export function validateCollectionId(req: Request, res: Response, next: NextFunction): void {
  const fullPath = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  if (COLLECTION_ID_PATH.test(fullPath)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  next();
}

/**
 * Factory que valida el parámetro de id nombrado en una ruta concreta.
 *
 * Rechaza con 400 `{"error":"Invalid id"}` cuando el parámetro no es un entero
 * positivo (mismo predicado y mismo cuerpo que la validación previa del
 * carrito, que usaba `Number`). El id numérico pero inexistente lo resuelve el
 * controller (§6.9), nunca el validador.
 *
 * @param {string} param - Nombre del parámetro de ruta (`req.params[param]`).
 * @returns {RequestHandler} Middleware listo para encadenar antes del controller.
 */
export function validateId(param: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[param];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && normalizeId(value) === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    next();
  };
}
