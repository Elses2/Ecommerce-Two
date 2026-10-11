import express from "express";
import path from "path";
import pagesRoutes from "./routes/pages.routes.js";
import apiRoutes from "./routes/index.routes.js";
import docsRouter from "./routes/docs.routes.js";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { baseMiddlewares } from "./middlewares/global/base.middleware.js";
import { sessionMiddleware } from "./middlewares/global/session.middleware.js";
import { injectCartCount } from "./middlewares/global/inject-cart-count.middleware.js";
import { notFound } from "./middlewares/error/not-found.middleware.js";
import { errorHandler } from "./middlewares/error/error-handler.middleware.js";
import { productService } from "./services/product.service.js";
import { getCategoryIconSvg } from "./utils/category-icons.js";

/**
 * @fileoverview Configuración e inicialización del servidor Express,
 * middlewares y rutas de la aplicación.
 *
 * Contrato de orden de montaje (spec §22): cada paso depende de los anteriores.
 * 1. `baseMiddlewares` (static → body parsers → layouts): los assets no deben
 *    pasar por la sesión.
 * 2. `sessionMiddleware`: `injectCartCount` necesita `req.session`.
 * 3. Globals propios (`injectCartCount`).
 * 4. Configuración de vistas y `app.locals`.
 * 5. `docsRouter` (Swagger, spec §10) antes del catch-all.
 * 6. Routers (páginas y API).
 * 7. `notFound` (spec §6.1), después de TODAS las rutas.
 * 8. `errorHandler` (spec §6.2), último de todos.
 */

// Truquito con url para que funcionen bien los path: re molesto, hay una forma mas moderna y corta de hacerlo pero lo dejo asi para mas claridad
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- 1. Middlewares globales de librería (ver base.middleware.ts) ---
app.use(baseMiddlewares);

// --- 2. Sesión (spec §6.4 / §11): debe correr antes de injectCartCount ---
app.use(sessionMiddleware);

// --- 3. Middlewares globales propios ---
app.use(injectCartCount); // expone cartCount a las vistas (suma de cantidades en req.session.cart, §6.11)

// --- 4. Configuración de vistas y locals ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "templates/layout"); // layout atómico: header + slot + footer

// Helper de vista (spec §6.6b): nombre de categoría → SVG de Lucide, disponible
// para todos los templates (organisms/categories-nav.ejs lo consume)
app.locals.getCategoryIconSvg = getCategoryIconSvg;
app.locals.fallbackImageUrl = env.images.fallbackUrl;

// Primer root: árbol atómico nuevo (views/templates). Segundo: páginas heredadas
// (src/views/pages) mientras se migran al nuevo árbol en pasos siguientes.
app.set("views", [
  path.join(process.cwd(), "views"),
  path.join(__dirname, "views"),
]);

// --- 5. Swagger UI interactiva (spec §10), antes del 404 ---
app.use("/api-docs", docsRouter);

// --- 6. Routers (acá usamos imports relativos, sin `path`) ---
app.use("/", pagesRoutes); // Frontend: /, /products, /cart, /login, etc.
app.use("/api", apiRoutes); // Backend: /api/products, /api/categories, etc.

// --- 7. 404 catch-all (spec §6.1), después de TODAS las rutas ---
app.use(notFound);

// --- 8. Error handler (spec §6.2): SIEMPRE al final ---
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  // Boot check (data-access R4): el servicio resuelve las filas seedeadas al arrancar
  console.log(`Productos seedeados: ${productService.list().length}`);
});

export default app;
