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
  /**
   * Renderiza la página principal (Home) del sitio web.
   *
   * @swagger
   * /:
   *   get:
   *     summary: Página de inicio
   *     description: Renderiza el home con categorías, banners, productos sugeridos y más pedidos.
   *     tags: [Páginas]
   *     responses:
   *       200:
   *         description: Página HTML del home.
   *
   * @param {Request} _req - Objeto de solicitud de Express (no utilizado en este handler).
   * @param {Response} res - Objeto de respuesta de Express para renderizar la vista 'index'.
   * @returns {void}
   */
  getHome(_req: Request, res: Response): void {
    res.render("templates/pages/index", {
      title: "Inicio",
      categories: categoryService.findAll(), // spec §4.1 bloques 2/6, §6.6b
      banners: promoService.getActiveBanners(), // spec §4.1 bloque 3, §6.6b
      suggested: productService.getSuggested(), // spec §4.1 bloque 4, §6.6
      mostOrdered: productService.getMostOrdered(), // spec §4.1 bloque 5, §6.7
    });
  },

  /**
   * Renderiza la vista inicial del carrito de compras cargando sus detalles desde la sesión.
   *
   * @swagger
   * /cart:
   *   get:
   *     summary: Vista del carrito
   *     description: Renderiza la página del carrito con los ítems de la sesión.
   *     tags: [Páginas]
   *     responses:
   *       200:
   *         description: Página HTML del carrito.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.session`).
   * @param {Response} res - Objeto de respuesta de Express para renderizar la vista 'cart'.
   * @returns {void}
   */
  getCart(req: Request, res: Response): void {
    res.render("templates/pages/cart", {
      title: "Carrito de Compras",
      cart: cartService.getCartWithDetails(req.session),
    });
  },

  /**
   * Renderiza la página de detalle de un producto específico.
   *
   * @swagger
   * /products/{id}:
   *   get:
   *     summary: Detalle de producto
   *     description: Renderiza la página de detalle de un producto por su ID.
   *     tags: [Páginas]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID numérico del producto.
   *     responses:
   *       200:
   *         description: Página HTML de detalle del producto.
   *       400:
   *         description: ID inválido (no numérico).
   *       404:
   *         description: Producto no encontrado.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.id`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
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

  /**
   * Renderiza el listado de productos de una categoría.
   *
   * @swagger
   * /categories/{categoryId}:
   *   get:
   *     summary: Productos por categoría
   *     description: Renderiza el listado de productos pertenecientes a una categoría.
   *     tags: [Páginas]
   *     parameters:
   *       - in: path
   *         name: categoryId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID numérico de la categoría.
   *     responses:
   *       200:
   *         description: Página HTML con los productos de la categoría.
   *       400:
   *         description: ID inválido.
   *       404:
   *         description: Categoría no encontrada.
   *
   * @param {Request} req - Objeto de solicitud de Express (requiere `req.params.categoryId`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
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

  /**
   * Renderiza el catálogo general de productos con ordenamiento por precio.
   *
   * @swagger
   * /products:
   *   get:
   *     summary: Catálogo de productos
   *     description: Listado de productos con orden opcional por precio.
   *     tags: [Páginas]
   *     parameters:
   *       - in: query
   *         name: sort
   *         required: false
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: asc
   *         description: Ordenar por precio.
   *     responses:
   *       200:
   *         description: Página HTML con el catálogo de productos.
   *
   * @param {Request} req - Objeto de solicitud de Express (evalúa `req.query.sort`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  getProducts(req: Request, res: Response): void {
    const sort = req.query.sort === "desc" ? "desc" : "asc";
    const products = productService.findAllWithSort(sort);

    res.render("templates/pages/products", { title: "Productos", products, sort });
  },

  /**
   * Ejecuta la búsqueda de productos por nombre y renderiza los resultados.
   *
   * @swagger
   * /search:
   *   get:
   *     summary: Búsqueda de productos
   *     description: Busca productos por nombre y renderiza los resultados.
   *     tags: [Páginas]
   *     parameters:
   *       - in: query
   *         name: query
   *         required: false
   *         schema:
   *           type: string
   *         description: Término de búsqueda.
   *     responses:
   *       200:
   *         description: Página HTML con los resultados de búsqueda.
   *
   * @param {Request} req - Objeto de solicitud de Express (evalúa `req.query.query`).
   * @param {Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
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
};