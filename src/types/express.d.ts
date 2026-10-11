import type { Role } from "../models/user.model.js";

/**
 * @fileoverview Aumento de tipos de Express (spec §23.3, enmienda cookie
 * httpOnly): `authenticate` deja el usuario del JWT en `req.user` para que
 * controllers y `authorize` lo lean; `attachUser` deja la identidad
 * (id + name + role) en `res.locals.user` para que las vistas EJS la pinten
 * sin consultar la base.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Usuario autenticado por el middleware `authenticate` (spec §23.3). */
      user?: { id: number; role: Role };
    }
    interface Locals {
      /** Identidad del usuario para las vistas (attachUser, spec §23.3). */
      user?: { id: number; role: Role; name: string } | null;
    }
  }
}

export {};
