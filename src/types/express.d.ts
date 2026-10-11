import type { Role } from "../models/user.model.js";

/**
 * @fileoverview Aumento de tipos de Express (spec §23.3): `authenticate` deja
 * el usuario del JWT en `req.user` para que controllers y `authorize` lo lean.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Usuario autenticado por el middleware `authenticate` (spec §23.3). */
      user?: { id: number; role: Role };
    }
  }
}

export {};
