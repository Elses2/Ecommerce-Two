import type { Request, Response } from "express";
import { categoryService } from "../../services/category.service.js";
import { productService } from "../../services/product.service.js";
import { promoService } from "../../services/promo.service.js";
import { cartService } from "../../services/cart.service.js";
import { normalizeId } from "../../utils/normalizeId.js";

// Controller de páginas: consolida los handlers de vistas que antes vivían
// en pages.routes (rutas finas: route → controller). Home según spec §4.1:
// categorías (bloques 2 y 6), banners (bloque 3, §6.6b), sugeridos
// (bloque 4, §6.6) y más pedidos (bloque 5, §6.7). Header (1) y footer (7)
// los aporta templates/layout.ejs.
export const pagesController = {
  getHome(_req: Request, res: Response): void {
    res.render("templates/pages/index", {
      title: "Inicio",
      categories: categoryService.findAll(), // spec §4.1 bloques 2/6, §6.6b
      banners: promoService.getActiveBanners(), // spec §4.1 bloque 3, §6.6b
      suggested: productService.getSuggested(), // spec §4.1 bloque 4, §6.6
      mostOrdered: productService.getMostOrdered(), // spec §4.1 bloque 5, §6.7
    });
  },

  // Carrito (spec §4.2/§6.4): render inicial con los ítems ya pintados desde
  // el server (sesión + datos reales); las mutaciones son AJAX vía /api/cart/*.
  getCart(req: Request, res: Response): void {
    res.render("templates/pages/cart", {
      title: "Carrito de Compras",
      cart: cartService.getCartWithDetails(req.session),
    });
  },

  // Detalle de producto (spec §6.8/Paso 8): id validado con el helper puro
  // normalizeId (§6.9 — solo formato, 400 si no numérico) y existencia
  // resuelta acá tras consultar el servicio (404 si no está). pages/400 y
  // pages/404 llegan en el Paso 10; por ahora respuesta de texto plano.
  // Relacionados: hasta 4 que comparten categoría, al azar si hay más (§6.8).
  getProductDetail(req: Request, res: Response): void {
    const rawId = req.params.id;
    // @types/express 5 tipa params como string | string[] (con undefined bajo
    // noUncheckedIndexedAccess) — cualquier forma rara cae en normalizeId,
    // que devuelve null (→ 400) para lo que no sea entero > 0.
    const raw = Array.isArray(rawId) ? (rawId[0] ?? "") : (rawId ?? "");
    const id = normalizeId(raw);
    if (id === null) {
      res.status(400).send("ID inválido");
      return;
    }

    const product = productService.findById(id);
    if (!product) {
      res.status(404).send("Producto no encontrado");
      return;
    }

    const related = productService.getRelated(product.id, product.categories);

    res.render("templates/pages/product-detail", {
      title: product.name,
      product,
      related,
    });
  },
};
