import express from "express";
import type { RequestHandler } from "express";
import expressLayouts from "express-ejs-layouts";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";

/**
 * @fileoverview Middlewares de librería de configuración simple, agrupados en
 * un único array para que `app.ts` solo los monte (spec §22).
 *
 * Orden interno (contrato §22.4, enmienda cookie httpOnly): `helmet` primero
 * (cabeceras de seguridad en toda respuesta), `express.static` para que los
 * assets no pasen por la cookie ni por los parsers (M14: estáticos sin
 * `Set-Cookie`), `cookieParser` (los assets no lo necesitan), los body
 * parsers (`json` → `urlencoded`) y por último `express-ejs-layouts`, que
 * envuelve `res.render` antes de los routers.
 */

// En desarrollo `upgrade-insecure-requests` rompe http://localhost; en
// producción (HTTPS) se deja el default de helmet.
const isProduction = process.env.NODE_ENV === "production";

/**
 * CSP (spec §23.5/§24): `img-src` permite `data:` y `https:` porque el fallback
 * de imágenes (§2) y las `image_url` remotas viven fuera del origen. Swagger UI
 * relaja su propio CSP solo en `/api-docs` (usa scripts/estilos inline).
 */
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      "img-src": ["'self'", "data:", "https:"],
      ...(isProduction ? {} : { "upgrade-insecure-requests": null }),
    },
  },
});

/**
 * Middlewares globales de librería, listos para `app.use(baseMiddlewares)`.
 */
export const baseMiddlewares: RequestHandler[] = [
  securityMiddleware,
  // static (spec §14): sirve dist/public; antes de la cookie y los parsers
  express.static(path.join(process.cwd(), "dist/public")),
  // Cookie parser (spec §22.4, enmienda cookie httpOnly): parsea las cookies
  // para `extractToken`/`attachUser`. Va después de static y antes de los
  // body parsers.
  cookieParser(),
  // Body parsers: JSON (fetch del carrito/auth/checkout) y urlencoded
  express.json(),
  express.urlencoded({ extended: true }),
  // Sistema de layouts EJS (spec §6.14): header + slot + footer
  expressLayouts,
];
