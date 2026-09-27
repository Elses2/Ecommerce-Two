import type { Request, Response } from "express";
import { Router } from "express";
import { pagesController } from "../controllers/pages/pages.controller.js";

/**
 * Router principal para el renderizado de vistas/páginas desde el servidor (SSR).
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
// categoría (§6.9: normalizeId aplica a ":id" numérico). Sin conflicto de
// shadowing: no hay otra ruta /categories* en este router (las /api/categories
// viven montadas bajo /api). El :categoryId lo valida el controller (§6.9).
router.get("/categories/:categoryId", pagesController.getCategory);

router.get("/cart", pagesController.getCart); // render inicial (spec §6.4), mutaciones por /api/cart

// Checkout placeholder (spec §6.5/Paso 11): el render inline con la página
// legacy vacía se reemplaza por el controller del árbol atómico.
router.get("/checkout", pagesController.getCheckout);

// Login/Register (spec §4.4/§4.5, Paso 9): atomic templates from the new tree

/**
 * Handler para renderizar la página de registro de usuarios.
 *
 * @param {Request} _req - Objeto de solicitud de Express.
 * @param {Response} res - Objeto de respuesta de Express.
 * @returns {void}
 */
function renderRegisterPage(_req: Request, res: Response): void {
  res.render("templates/pages/register", { title: "Crear Cuenta" });
}

/**
 * Handler para renderizar la página de inicio de sesión.
 *
 * @param {Request} _req - Objeto de solicitud de Express.
 * @param {Response} res - Objeto de respuesta de Express.
 * @returns {void}
 */
function renderLoginPage(_req: Request, res: Response): void {
  res.render("templates/pages/login", { title: "Iniciar Sesión" });
}

router.get("/register", renderRegisterPage);
router.get("/login", renderLoginPage);

/**
 * Router consolidado de vistas HTML públicas.
 */
export default router;