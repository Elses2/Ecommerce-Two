import { Router } from "express";
import { categoryService } from "../services/category.service.js";

const router = Router();

router.get("/", (req, res) =>
  res.render("templates/pages/index", {
    title: "Inicio",
    categories: categoryService.findAll(), // spec §4.1 bloque 2 / §6.6b
  }),
);
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
