/**
 * @fileoverview Modelo de la tabla `users` (spec §1.1) y rol de autorización
 * (spec §23).
 */

/**
 * Rol del usuario para autorización (spec §23.3). El rol viaja en el JWT; no se
 * crea por `/register` (siempre `customer`).
 */
export type Role = "customer" | "admin";

/**
 * Fila de la tabla `users` (spec §1.1).
 */
export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string | null;
}
