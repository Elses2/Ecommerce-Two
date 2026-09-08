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
  // resuelta acá tras consultar el servicio (404 si no está). El 404
  // renderiza la página 404 del árbol atómico (Paso 10, spec §6.1). El 400
  // queda como texto plano: §6.1/§6.2 solo definen páginas para 404/500 y
  // §6.9 trata el id inválido como respuesta de validación, no de vista.
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
      res.status(404).render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    const related = productService.getRelated(product.id, product.categories);

    res.render("templates/pages/product-detail", {
      title: product.name,
      product,
      related,
    });
  },

  // Categoría (spec §4.6/Paso 11): listado de productos por categoría. La
  // validación replica getProductDetail (§6.9): id no numérico → 400 texto
  // plano (§6.1/§6.2 solo definen páginas para 404/500); id numérico pero
  // inexistente → 404 con la página 404 del árbol atómico (misma decisión de
  // Paso 8/Paso 10 para el detalle de producto). Productos N:M con atributos
  // derivados ya resueltos por productService.findByCategory (Paso 1).
  getCategory(req: Request, res: Response): void {
    const rawId = req.params.categoryId;
    // @types/express 5 tipa params como string | string[] — misma defensa que
    // getProductDetail: cualquier forma rara cae en normalizeId (null → 400).
    const raw = Array.isArray(rawId) ? (rawId[0] ?? "") : (rawId ?? "");
    const categoryId = normalizeId(raw);
    if (categoryId === null) {
      res.status(400).send("ID inválido");
      return;
    }

    const category = categoryService.findById(categoryId);
    if (!category) {
      res.status(404).render("templates/pages/404", { title: "Página no encontrada" });
      return;
    }

    const products = productService.findByCategory(categoryId);

    res.render("templates/pages/category", {
      title: category.name,
      categoryName: category.name,
      products,
    });
  },

  // Listado de productos con orden por precio (spec §6.12/Paso 12):
  // server-rendered, NO AJAX — el orden viaja por query string. sort se
  // normaliza con whitelist: cualquier valor distinto de "desc" (incluido
  // garbage o ausente) cae en "asc", default del spec; nunca viaja crudo
  // hacia el SQL del repositorio. §6.12 no define un control de orden en la
  // página, solo el parámetro — sin UI de sort (decisión documentada).
  getProducts(req: Request, res: Response): void {
    const sort = req.query.sort === "desc" ? "desc" : "asc";
    const products = productService.findAllWithSort(sort);

    res.render("templates/pages/products", { title: "Productos", products, sort });
  },

  // Buscador (spec §6.13/Paso 12): server-rendered, NO AJAX. La query se
  // recorta; vacía o ausente → resultados vacíos ([]) con el mensaje
  // amigable de la vista — el spec renderiza, no redirige. La query viaja a
  // la vista y ahí se re-imprime SIEMPRE con <%= %> (escapado) — jamás <%- %> —
  // para que texto tipo "<script>" quede inerte en el HTML.
  searchProducts(req: Request, res: Response): void {
    // @types/express 5 tipa query como ParsedQs — misma defensa que en params:
    // cualquier forma rara (array/objeto) se reduce a la primera string.
    const rawQuery = req.query.query;
    const raw =
      typeof rawQuery === "string"
        ? rawQuery
        : Array.isArray(rawQuery)
          ? String(rawQuery[0] ?? "")
          : "";
    const query = raw.trim();
    const products = query ? productService.searchByName(query) : [];

    res.render("templates/pages/search-results", {
      title: `Resultados para "${query}"`,
      products,
      query,
    });
  },

  // Checkout placeholder (spec §6.5/Paso 11): vista estática sin lógica —
  // "Nada de lógica de negocio ni de sesión acá — es un placeholder
  // deliberado". El message viaja como local desde acá, tal como el
  // pseudo-código de §6.5.
  getCheckout(_req: Request, res: Response): void {
    res.render("templates/pages/checkout", {
      title: "Checkout",
      message: "Checkout disponible en el próximo sprint",
    });
  },
};
