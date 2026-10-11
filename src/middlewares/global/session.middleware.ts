import session from "express-session";
///database
import SqliteStoreFactory from "better-sqlite3-session-store";
import db from "../../config/database.js";
import { env } from "../../config/env.js";

/**
 * @fileoverview Sesión de Express lista para montar (spec §6.4 y §11).
 *
 * Se sacó de `app.ts` en la Fase 5 del refactor (issue #91) con **paridad
 * estricta** de configuración: mismo store SQLite, misma cookie y mismas
 * opciones. Debe montarse ANTES de `injectCartCount`, que lee `req.session.cart`.
 */

const SqliteStore = SqliteStoreFactory(session);

/**
 * Configuración de `express-session` (spec §6.4/§11): se usa SOLO para el
 * carrito, no para auth. Cookie de sesión sin `maxAge` → el carrito se pierde
 * al cerrar el navegador. `saveUninitialized: false` → la cookie solo se emite
 * en la primera mutación del carrito; los GET puros no crean sesión. El store
 * SQLite persiste la sesión y sobrevive reinicios del servidor.
 */
export const sessionMiddleware = session({
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new SqliteStore({
    client: db,
    expired: {
      clear: true,
      intervalMs: 900000, // limpia sesiones vencidas cada 15 min
    },
  }),
  cookie: { httpOnly: true, sameSite: "lax" },
});
