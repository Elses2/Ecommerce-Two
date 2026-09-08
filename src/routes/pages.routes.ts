import { Router } from "express";
import { pagesController } from "../controllers/pages/pages.controller.js";

const router = Router();

// Ruta fina (spec Paso 5): la lógica de ensamblado de datos vive en el controller
router.get("/", pagesController.getHome);
router.get("/products", (req, res) =>
  res.render("pages/products", { title: "Producto" }),
);
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
// (multi-root views, cwd root first). Legacy src/views/pages/*.ejs stay as
// dead code — deletion is deferred to a later cleanup.
router.get("/register", (req, res) =>
  res.render("templates/pages/register", { title: "Crear Cuenta" }),
);
router.get("/login", (req, res) =>
  res.render("templates/pages/login", { title: "Iniciar Sesión" }),
);

export default router;
