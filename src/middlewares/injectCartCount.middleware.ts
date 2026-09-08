import type { NextFunction, Request, Response } from "express";

// injectCartCount: expone el contador del carrito a las vistas (0 hasta Paso 6,
// cuando se configure la sesión)
export function injectCartCount(_req: Request, res: Response, next: NextFunction): void {
  res.locals.cartCount = 0;
  next();
}
