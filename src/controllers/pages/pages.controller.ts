import type { Request, Response } from "express";
import { categoryService } from "../../services/category.service.js";
import { productService } from "../../services/product.service.js";
import { promoService } from "../../services/promo.service.js";

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
};
