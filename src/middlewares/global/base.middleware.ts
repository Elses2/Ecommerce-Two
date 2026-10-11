import express from "express";
import type { RequestHandler } from "express";
import expressLayouts from "express-ejs-layouts";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { env } from "../../config/env.js";

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

/**
 * CSP (spec §22.2/§23.5/§24). Orígenes reales del layout:
 * - `'self'`: `/css/styles.css`, `/js/*.js`, favicons y los `fetch` a `/api/*`.
 * - `https:` + `data:` en `img-src`: `image_url` de productos/banners y el
 *   fallback por defecto (`placehold.co`, §2.3).
 * - `script-src-attr 'unsafe-inline'`: las imágenes usan `onerror="..."` inline
 *   para caer al fallback; sin esto el CSP los bloquea. El `script-src`
 *   principal se mantiene en `'self'` (no hay scripts inline en el HTML).
 * - `style-src` conserva el default de helmet (`'self' https: 'unsafe-inline'`;
 *   Tailwind vive en un CSS externo).
 * - `upgrade-insecure-requests` se controla con `CSP_UPGRADE_INSECURE`
 *   (default `false`): un deploy por `http://IP:PUERTO` lo necesita desactivado
 *   o el navegador sube los assets a `https` y la página queda sin estilos.
 * Swagger UI relaja su propio CSP solo en `/api-docs` (usa scripts/estilos inline).
 */
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      "img-src": ["'self'", "data:", "https:"],
      "script-src-attr": ["'unsafe-inline'"],
      "upgrade-insecure-requests": env.cspUpgradeInsecure ? [] : null,
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
