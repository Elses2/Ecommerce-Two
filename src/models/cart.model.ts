import "express-session";

// Modelo de sesión del carrito (spec §6.4): la sesión guarda SOLO ids y
// cantidades — nunca el producto completo ni el precio (los totales siempre
// se recalculan desde la DB en cart.service.getCartWithDetails).
export interface SessionCartItem {
  productId: number;
  quantity: number;
}

// Augmentación de tipos: req.session.cart disponible en todo el server.
declare module "express-session" {
  interface SessionData {
    cart?: SessionCartItem[];
  }
}
