import express from "express";
import path from "path";
import pagesRoutes from "./routes/pages.routes.js";
import apiRoutes from "./routes/index.routes.js";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import { env } from "./config/env.js";
import { injectCartCount } from "./middlewares/injectCartCount.middleware.js";
import { normalizeId } from "./middlewares/normalizeId.middleware.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { productService } from "./services/product.service.js";
import { getCategoryIconSvg } from "./utils/category-icons.js";

// Truquito con url para que funconen bien los path: re molesto, hay una forma mas moderna y corta de hacerlo pero lo dejo asi para mas claridad
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Configuración de vistas ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
//  --- Aca tuve problemas para que me leyera el css de tailwinds no es lo ideal pero esto hace que devamos ejecutar desde el package.json ---
app.use(express.static(path.join(process.cwd(), "dist/public")));
// --- Middlewares globales ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// express-session (spec §6.4): se usa SOLO para el carrito, no para auth.
// MemoryStore OK en desarrollo; cookie de sesión sin maxAge → el carrito se
// pierde al cerrar el navegador. Debe correr antes de injectCartCount (lee
// req.session.cart). saveUninitialized: false → la cookie solo se emite en
// la primera mutación del carrito; los GET puros no crean sesión.
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);

// Activamos el sistema de layouts
app.use(expressLayouts);
app.set("layout", "templates/layout"); // layout atómico: header + slot + footer
// Helper de vista (spec §6.6b): nombre de categoría → SVG de Lucide, disponible
// para todos los templates (organisms/categories-nav.ejs lo consume)
app.locals.getCategoryIconSvg = getCategoryIconSvg;
// Primer root: árbol atómico nuevo (views/templates). Segundo: páginas heredadas
// (src/views/pages) mientras se migran al nuevo árbol en pasos siguientes.
app.set("views", [path.join(process.cwd(), "views"), path.join(__dirname, "views")]);

// --- Middlewares cross-cutting (orden: ver design D6) ---
app.use(injectCartCount); // expone cartCount a las vistas (0 hasta Paso 6)
app.use(normalizeId); // valida :id numérico, 400 si no

// --- Routers (acá usamos imports relativos, sin `path`) ---
app.use("/", pagesRoutes); // Frontend: /, /products, /cart, /login, etc.
app.use("/api", apiRoutes); // Backend: /api/products, /api/categories, etc.

// --- Error handler: SIEMPRE al final ---
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  // Boot check (data-access R4): el servicio resuelve las filas seedeadas al arrancar
  console.log(`Productos seedeados: ${productService.list().length}`);
});

export default app;
