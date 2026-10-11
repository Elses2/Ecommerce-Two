import type BetterSqlite3 from "better-sqlite3";
import db from "../config/database.js";
import type { User } from "../models/user.model.js";

/**
 * @fileoverview Repositorio de usuarios (spec §0/§23): único lugar que consulta
 * la tabla `users`. Métodos reales de auth (buscar, crear) más el
 * `ensureGuestUser` temporal que el checkout todavía usa hasta el PR de Redis
 * (se elimina al migrar el checkout a usuario autenticado, spec §19/D5).
 */

/**
 * Datos mínimos para crear un usuario (spec §23.2). El rol no se recibe: siempre
 * nace `customer` (el rol admin se crea por seed, nunca por `/register`).
 */
export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export class UserRepository {
  /**
   * Inicializa la instancia del repositorio de usuarios.
   *
   * @param {BetterSqlite3.Database} [database=db] - Instancia de la base de datos SQLite.
   */
  constructor(private database: BetterSqlite3.Database = db) {}

  /**
   * Busca un usuario por email exacto (spec §23.2).
   *
   * @param {string} email - Email normalizado (minúsculas, recortado).
   * @returns {User | undefined} El usuario encontrado, o `undefined`.
   */
  findByEmail(email: string): User | undefined {
    return this.database
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as User | undefined;
  }

  /**
   * Busca un usuario por id (spec §23.2, usado por `GET /api/auth/me`).
   *
   * @param {number} id - Id del usuario.
   * @returns {User | undefined} El usuario encontrado, o `undefined`.
   */
  findById(id: number): User | undefined {
    return this.database.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      User | undefined;
  }

  /**
   * Crea un usuario nuevo con rol `customer` (spec §23.2).
   *
   * @param {CreateUserInput} input - Nombre completo, email normalizado y hash.
   * @returns {User} El usuario recién creado.
   * @throws {Error} Propaga la violación del UNIQUE de `users.email` (el service la traduce).
   */
  create(input: CreateUserInput): User {
    const info = this.database
      .prepare(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      )
      .run(input.name, input.email, input.passwordHash);
    const created = this.findById(Number(info.lastInsertRowid));
    // El SELECT inmediato siempre encuentra la fila recién insertada.
    return created as User;
  }

  /**
   * Garantiza la existencia del usuario invitado (Guest) y devuelve su id.
   *
   * @deprecated Temporal: se elimina al migrar el checkout a auth real (spec
   * §19/D5). Hasta entonces satisface la FK `orders.user_id`.
   *
   * @returns {number} El id del usuario invitado en la tabla users.
   */
  ensureGuestUser(): number {
    const existing = this.database
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("guest@local") as { id: number } | undefined;
    if (existing) {
      return existing.id;
    }
    const info = this.database
      .prepare(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      )
      .run("Guest", "guest@local", "!");
    return Number(info.lastInsertRowid);
  }
}

/** Instancia singleton de `UserRepository`. */
export const userRepository = new UserRepository();
