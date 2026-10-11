import express from "express";
import type { RequestHandler } from "express";
import expressLayouts from "express-ejs-layouts";
import path from "path";

/**
 * @fileoverview Middlewares de librería de configuración simple, agrupados en
 * un único array para que `app.ts` solo los monte (spec §22).
 *
 * Orden interno (contrato): `express.static` primero para que los assets no
 * pasen por la sesión; luego los body parsers (`json` → `urlencoded`, el orden
 * que tenía `app.ts`); por último `express-ejs-layouts`, que envuelve
 * `res.render` antes de que lleguen los routers.
 */

/**
 * Middlewares globales de librería, listos para `app.use(baseMiddlewares)`.
 */
export const baseMiddlewares: RequestHandler[] = [
  // static (spec §14): sirve dist/public; va primero para no crear sesión en assets
  express.static(path.join(process.cwd(), "dist/public")),
  // Body parsers: JSON (fetch del carrito) y urlencoded (formularios SSR)
  express.json(),
  express.urlencoded({ extended: true }),
  // Sistema de layouts EJS (spec §6.14): header + slot + footer
  expressLayouts,
];
