import { Router } from "express";
import { pagesController } from "../controllers/pages/pages.controller.js";

const router = Router();

// Ruta fina (spec Paso 5): la lógica de ensamblado de datos vive en el controller
router.get("/", pagesController.getHome);
router.get("/products", (req, res) =>
  res.render("pages/products", { title: "Producto" }),
);
router.get("/cart", (req, res) =>
  res.render("pages/cart", { title: "Carrito de Compras" }),
);
router.get("/checkout", (req, res) =>
  res.render("pages/checkout", { title: "Pago" }),
);
router.get("/register", (req, res) =>
  res.render("pages/register", { title: "Crear Cuenta" }),
);
router.get("/login", (req, res) =>
  res.render("pages/login", { title: "Iniciar Sesión" }),
);

export default router;
