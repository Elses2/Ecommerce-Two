import type { Request, Response } from "express";
import { Router } from "express";
import { pagesController } from "../controllers/pages/pages.controller.js";
import { checkoutController } from "../controllers/pages/checkout.controller.js";
import { requirePageAuth } from "../middlewares/route/require-page-auth.middleware.js";

/**
 * @fileoverview Router principal para el renderizado de vistas/páginas desde
 * el servidor (SSR). Con cookie (spec §24.3, enmienda cookie httpOnly), las
 * páginas protegidas (`/cart`, `/checkout`) usan `requirePageAuth`: el 302 a
 * `/login?next=...` lo emite el servidor, sin parpadeo ni hidratación. Los
 * `next` salen de `req.originalUrl` (siempre empieza con `/`).
 */
const router = Router();

// Ruta fina (spec Paso 5): la lógica de ensamblado de datos vive en el controller
router.get("/", pagesController.getHome);

// Productos con orden por precio (spec §6.12/Paso 12): el render inline legacy
// se reemplaza por el controller del árbol atómico — una sola ruta /products.
router.get("/products", pagesController.getProducts);

// Buscador (spec §6.13/Paso 12): server-rendered, hermana de /products —
// molecules/search.ejs ya apunta acá (GET, input name="query").
router.get("/search", pagesController.searchProducts);

// Detalle de producto (spec §6.8/Paso 8): va después de /products — el match
// exacto de /products no se ve afectado y :id solo captura el segmento extra.
router.get("/products/:id", pagesController.getProductDetail);

// Categoría (spec §4.6/Paso 11): la URL canónica del spec para el listado por
// categoría (§6.9: el helper normalizeId aplica a ":id" numérico). Sin
// conflicto de shadowing: no hay otra ruta /categories* en este router (las
// /api/categories viven montadas bajo /api). El :categoryId lo valida el
// controller (§6.9).
router.get("/categories/:categoryId", pagesController.getCategory);

router.get("/cart", requirePageAuth, pagesController.getCart); // render inicial (spec §6.4/§24.3), mutaciones por /api/cart

// Checkout (spec §19, reemplaza el placeholder del §6.5): GET arma el
// formulario con el token de idempotencia, POST crea la orden atómicamente y
// /checkout/confirmation/:token muestra la orden creada (D7 — por token, no
// por id). Con cookie httpOnly, la página exige sesión (requierePageAuth) y
// la confirmación sigue pública. El param se llama :token para no chocar con
// normalizeId (solo cubre /api/(products|categories|orders)/:id).
router.get("/checkout", requirePageAuth, checkoutController.showCheckout);
router.get(
  "/checkout/confirmation/:token",
  checkoutController.showConfirmation,
);

// Login/Register (spec §4.4/§4.5, Paso 9): atomic templates from the new tree

/**
 * Valida el parámetro `next` (spec §23.4): solo rutas internas que empiezan
 * con `/` y no con `//` (evita open redirect). El `next` que genera el servidor
 * sale de `req.originalUrl` (siempre válido); el que llega del cliente
 * (query string) pasa por este filtro.
 *
 * @param {unknown} value - Valor crudo de `req.query.next`.
 * @returns {string} Ruta interna segura, o `"/"`.
 */
function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Redirige a `next` (validado) o a `/` si ya hay sesión (spec §23.4,
 * enmienda cookie httpOnly): un usuario logueado no necesita ver login.
 *
 * @param {Request} req - Petición Express (lee `req.user` de `attachUser`).
 * @param {Response} res - Respuesta Express.
 * @param {string} page - Página a renderizar si no hay sesión.
 * @param {string} title - Título de la página.
 * @returns {void}
 */
function renderAuthPage(
  req: Request,
  res: Response,
  page: string,
  title: string,
): void {
  if (req.user) {
    res.redirect(safeNext(req.query.next));
    return;
  }
  res.render(page, { title });
}

/**
 * Handler para renderizar la página de registro de usuarios.
 *
 * @param {Request} req - Objeto de solicitud de Express (sesión vía attachUser).
 * @param {Response} res - Objeto de respuesta de Express.
 * @returns {void}
 */
function renderRegisterPage(req: Request, res: Response): void {
  renderAuthPage(req, res, "templates/pages/register", "Crear Cuenta");
}

/**
 * Handler para renderizar la página de inicio de sesión.
 *
 * @param {Request} req - Objeto de solicitud de Express (sesión vía attachUser).
 * @param {Response} res - Objeto de respuesta de Express.
 * @returns {void}
 */
function renderLoginPage(req: Request, res: Response): void {
  renderAuthPage(req, res, "templates/pages/login", "Iniciar Sesión");
}

router.get("/register", renderRegisterPage);
router.get("/login", renderLoginPage);

/**
 * Router consolidado de vistas HTML públicas.
 */
export default router;
