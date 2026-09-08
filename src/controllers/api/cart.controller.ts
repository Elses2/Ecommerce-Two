import type { Request, Response } from "express";
import { cartService } from "../../services/cart.service.js";
import { productService } from "../../services/product.service.js";

// Controller de API del carrito (spec §6.4): handlers finos que llaman al
// cartService y responden JSON con el carrito ya recalculado
// ({ items, total, count }) para que el frontend no pida nada aparte.

// §6.9: id no numérico → 400. El middleware normalizeId solo cubre rutas
// /api/{recurso}/:id — las de carrito son /api/cart/{verbo}/:productId y se
// validan acá (el segmento "clear" es estático, no un id).
function parseProductId(raw: string | string[] | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const cartController = {
  addItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Existencia → 404 (§6.9) y stock → rechazo con mensaje (§6.10), ambos
    // ANTES de mutar la sesión.
    const product = productService.getById(productId);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (!product.inStock) {
      res.status(400).json({ error: "Product out of stock" });
      return;
    }
    cartService.addItem(req.session, productId);
    res.json(cartService.getCartWithDetails(req.session));
  },

  increaseItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.updateQuantity(req.session, productId, +1);
    res.json(cartService.getCartWithDetails(req.session));
  },

  decreaseItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.updateQuantity(req.session, productId, -1);
    res.json(cartService.getCartWithDetails(req.session));
  },

  removeItem(req: Request, res: Response): void {
    const productId = parseProductId(req.params.productId);
    if (productId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    cartService.removeItem(req.session, productId);
    res.json(cartService.getCartWithDetails(req.session));
  },

  clearCart(req: Request, res: Response): void {
    cartService.clear(req.session);
    res.json(cartService.getCartWithDetails(req.session));
  },
};
