import type BetterSqlite3 from "better-sqlite3";
import db from "../config/database.js";

/**
 * @fileoverview Repositorio de usuarios: por ahora solo garantiza la existencia
 * del usuario invitado que satisface la FK de orders.user_id (spec §19 / D5).
 * Se elimina al implementar auth real (ver spectsEccomerce/contexto-usuarios-auth.md).
 */
export class UserRepository {
  /**
   * Inicializa la instancia del repositorio de usuarios.
   *
   * @param {BetterSqlite3.Database} [database=db] - Instancia de la base de datos SQLite.
   */
  constructor(private database: BetterSqlite3.Database = db) {}

  /**
   * Garantiza la existencia del usuario invitado (Guest) y devuelve su id.
   *
   * @deprecated Temporal: se elimina al implementar auth (ver spectsEccomerce/contexto-usuarios-auth.md)
   *
   * // Usuario invitado (spec §19 / D5): orders.user_id es NOT NULL con FK a
   * // users y todavía no hay auth; esta fila única satisface la FK. La primera
   * // llamada INSERTa 'Guest'; las siguientes reutilizan el mismo id. El
   * // password_hash '!' es deliberadamente inutilizable (no existe hashing aún).
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