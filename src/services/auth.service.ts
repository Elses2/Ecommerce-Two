import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { userRepository } from "../repositories/user.repository.js";
import type { Role, User } from "../models/user.model.js";
import type { LoginDto, PublicUser, RegisterDto } from "../dtos/auth.dto.js";

/**
 * @fileoverview Servicio de autenticación (spec §23.2): registro, login y
 * firma/verificación de JWT HS256. No conoce Express ni SQL (regla del §0).
 * Sigue el estilo del §19.5: los errores de negocio **no se lanzan**, se
 * devuelven en un resultado tipado.
 */

/**
 * Resultado de register/login (spec §23.2). Éxito → `{ ok: true, user, token }`;
 * fallo → `{ ok: false, reason, errors }` con mensajes en español para el cliente.
 */
export type AuthResult =
  | { ok: true; user: PublicUser; token: string }
  | {
      ok: false;
      reason: "validation" | "email_taken" | "invalid_credentials";
      errors: string[];
    };

// Coste de bcrypt (spec §23.2): 12 rondas, alineado con buenas prácticas actuales.
const BCRYPT_ROUNDS = 12;

// Límite de bcrypt: trunca silenciosamente a 72 bytes; se valida explícitamente.
const PASSWORD_MAX = 72;

// Email pragmático: algo@algo.algo (mismo criterio que checkout, §19.5).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hash falso para que login tarde lo mismo exista o no el email (evita enumerar
// usuarios por timing). Se calcula una sola vez al cargar el módulo.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

/**
 * Normaliza un valor del body a string recortado (defensa en profundidad, §19.5).
 *
 * @param {unknown} value - Valor crudo del body.
 * @returns {string} El valor recortado, o `""` si no era string.
 */
function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Detecta la violación del UNIQUE de `users.email` (spec §23.2, carrera de
 * registros concurrentes) sin importar el paquete de la DB.
 *
 * @param {unknown} error - Error capturado.
 * @returns {boolean} `true` si es la violación del índice único de email.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

/**
 * Proyecta una fila `users` a la vista pública (spec §23.2): nunca expone
 * `password_hash`.
 *
 * @param {User} user - Fila completa de la tabla.
 * @returns {PublicUser} Usuario sin datos sensibles.
 */
function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export class AuthService {
  /**
   * Valida el formulario de registro (spec §23.2). Mensajes en español, como
   * `validateCheckoutInput` (§19.5).
   *
   * @param {RegisterDto} input - Datos crudos del formulario.
   * @returns {string[]} Lista de errores; vacía si todo es válido.
   */
  validateRegisterInput(input: RegisterDto): string[] {
    const errors: string[] = [];
    const name = toTrimmed(input.name);
    const lastname = toTrimmed(input.lastname);
    const email = toTrimmed(input.email);
    const password = input.password ?? "";

    if (!name) errors.push("El nombre es obligatorio");
    else if (name.length > 100)
      errors.push("El nombre no puede superar los 100 caracteres");

    if (!lastname) errors.push("El apellido es obligatorio");
    else if (lastname.length > 100) {
      errors.push("El apellido no puede superar los 100 caracteres");
    }

    if (!email) errors.push("El email es obligatorio");
    else if (email.length > 200)
      errors.push("El email no puede superar los 200 caracteres");
    else if (!EMAIL_PATTERN.test(email))
      errors.push("El email no tiene un formato válido");

    if (!password) errors.push("La contraseña es obligatoria");
    else if (password.length < 8)
      errors.push("La contraseña debe tener al menos 8 caracteres");
    else if (password.length > PASSWORD_MAX) {
      errors.push(
        `La contraseña no puede superar los ${PASSWORD_MAX} caracteres`,
      );
    }

    return errors;
  }

  /**
   * Registra un usuario nuevo y devuelve el token (spec §23.2).
   *
   * @param {RegisterDto} input - Datos del formulario de registro.
   * @returns {Promise<AuthResult>} Usuario + token, o el fallo tipado.
   */
  async register(input: RegisterDto): Promise<AuthResult> {
    const errors = this.validateRegisterInput(input);
    if (errors.length > 0) {
      return { ok: false, reason: "validation", errors };
    }

    const email = toTrimmed(input.email).toLowerCase();
    if (userRepository.findByEmail(email)) {
      return {
        ok: false,
        reason: "email_taken",
        errors: ["Ese email ya está registrado"],
      };
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const user = userRepository.create({
        name: `${toTrimmed(input.name)} ${toTrimmed(input.lastname)}`,
        email,
        passwordHash,
      });
      return {
        ok: true,
        user: toPublicUser(user),
        token: this.signToken(user),
      };
    } catch (error) {
      // Carrera: otro request insertó el mismo email entre el SELECT y el INSERT.
      if (isUniqueConstraintError(error)) {
        return {
          ok: false,
          reason: "email_taken",
          errors: ["Ese email ya está registrado"],
        };
      }
      throw error;
    }
  }

  /**
   * Valida credenciales y devuelve el token (spec §23.2). Mismo mensaje para
   * email inexistente y contraseña incorrecta: no revela qué emails existen.
   *
   * @param {string} emailRaw - Email tipeado (se normaliza).
   * @param {string} password - Contraseña tipeada.
   * @returns {Promise<AuthResult>} Usuario + token, o `invalid_credentials`.
   */
  async login(emailRaw: string, password: string): Promise<AuthResult> {
    const user = userRepository.findByEmail(toTrimmed(emailRaw).toLowerCase());
    const match = await bcrypt.compare(
      password ?? "",
      user?.password_hash ?? DUMMY_HASH,
    );
    if (!user || !match) {
      return {
        ok: false,
        reason: "invalid_credentials",
        errors: ["Credenciales inválidas"],
      };
    }
    return { ok: true, user: toPublicUser(user), token: this.signToken(user) };
  }

  /**
   * Firma un JWT HS256 con `sub` (id) y `role` (spec §23.2). El payload es
   * legible: no debe llevar datos sensibles.
   *
   * @param {{ id: number; role: Role }} user - Usuario a firmar.
   * @returns {string} Token JWT firmado.
   */
  signToken(user: { id: number; role: Role }): string {
    return jwt.sign({ role: user.role }, env.jwtSecret, {
      subject: String(user.id),
      expiresIn: env.jwtExpiresIn as NonNullable<SignOptions["expiresIn"]>,
      algorithm: "HS256",
    });
  }

  /**
   * Verifica un JWT y devuelve `sub` + `role` (spec §23.2). Fijar
   * `algorithms: ["HS256"]` evita ataques de cambio de algoritmo.
   *
   * @param {string} token - Token recibido en `Authorization: Bearer`.
   * @returns {{ sub: number; role: Role } | null} Payload válido, o `null`.
   */
  verifyToken(token: string): { sub: number; role: Role } | null {
    try {
      const payload = jwt.verify(token, env.jwtSecret, {
        algorithms: ["HS256"],
      });
      if (typeof payload === "string" || !payload.sub) return null;
      const role: Role = payload.role === "admin" ? "admin" : "customer";
      const sub = Number(payload.sub);
      if (!Number.isInteger(sub) || sub <= 0) return null;
      return { sub, role };
    } catch {
      return null; // expirado, manipulado o malformado
    }
  }
}

/** Instancia singleton de `AuthService` (convención del §0, como `checkoutService`). */
export const authService = new AuthService();
