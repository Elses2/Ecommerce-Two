import type { Role } from "../models/user.model.js";

/**
 * @fileoverview DTOs del flujo de autenticación (spec §23.2): forma de entrada
 * de register/login y forma pública del usuario (nunca incluye
 * `password_hash`).
 */

/**
 * Entrada del formulario de registro (spec §4.5): `name` y `lastname` vienen
 * separados en la vista; el service los une en `users.name`.
 */
export interface RegisterDto {
  name: string;
  lastname: string;
  email: string;
  password: string;
}

/**
 * Entrada del formulario de login (spec §4.4).
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * Vista pública de un usuario: lo único que sale por la API. Nunca incluye
 * `password_hash` ni `created_at` (spec §23.2).
 */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}
