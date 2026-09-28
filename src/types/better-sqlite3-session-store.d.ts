/**
 * @fileoverview Declaración de tipos para `better-sqlite3-session-store`.
 *
 * Este módulo tipa el factory `SqliteStoreFactory` que persiste las sesiones
 * de `express-session` en la base de datos SQLite (`dev.db`) en lugar de
 * mantenerlas en memoria.
 *
 * Existe porque el paquete `better-sqlite3-session-store` no incluye sus
 * propios tipos y no hay un paquete `@types/better-sqlite3-session-store`
 * disponible. Estos tipos solo intervienen en tiempo de compilación; no
 * afectan el runtime.
 */

declare module "better-sqlite3-session-store" {
  import { Store } from "express-session";
  import type { Database } from "better-sqlite3";

  /**
   * Opciones de configuración para el store de sesiones SQLite.
   */
  interface Options {
    /**
     * Cliente de base de datos `better-sqlite3` ya inicializado.
     */
    client: Database;
    /**
     * Configuración de limpieza de sesiones expiradas.
     */
    expired?: {
      /**
       * Si es `true`, elimina automáticamente las sesiones expiradas.
       */
      clear?: boolean;
      /**
       * Intervalo en milisegundos entre cada limpieza de sesiones expiradas.
       */
      intervalMs?: number;
    };
  }

  /**
   * Factory que crea una clase `Store` de `express-session` respaldada por
   * SQLite. Se usa como `SqliteStoreFactory(session)` y la clase resultante
   * se instancia con un objeto `Options`.
   * @param session - Módulo `express-session` pasado por el usuario de la app.
   * @returns Constructor de un store que extiende `express-session` `Store`.
   */
  function SqliteStoreFactory(session: any): {
    new (options: Options): Store;
  };

  export default SqliteStoreFactory;
}
