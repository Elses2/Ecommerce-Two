import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * @fileoverview Persistencia del carrito en Redis (spec §24). Único lugar que
 * conoce Redis (regla del §0, enmendada: SQLite síncrono + Redis asíncrono).
 *
 * Modelo: un Hash por usuario (`cart:<userId>`), campo = `productId`, valor =
 * cantidad. `HINCRBY` es atómico, así que dos clics simultáneos no se pisan
 * (a diferencia del leer-modificar-guardar de la sesión anterior).
 */

/**
 * Cliente Redis compartido. `lazyConnect: true` evita abrir la conexión hasta
 * la primera operación (y que importar el módulo en tests abra sockets de
 * inmediato). `maxRetriesPerRequest: 2` hace fallar rápido si Redis no está.
 */
export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

redis.on("error", (err: Error) => console.error("[redis]", err.message));

// TTL del carrito (spec §24): 30 días sin actividad. `noeviction` en producción
// garantiza que Redis no descarte carritos por presión de memoria.
const TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Clave del Hash del carrito de un usuario.
 *
 * @param {number} userId - Id del usuario (del JWT).
 * @returns {string} Clave de Redis.
 */
const cartKey = (userId: number): string => `cart:${userId}`;

export const cartRepository = {
  /**
   * Devuelve el Hash completo del carrito (`productId` → cantidad en string).
   *
   * @param {number} userId - Id del usuario.
   * @returns {Promise<Record<string, string>>} Entradas del carrito.
   */
  getAll(userId: number): Promise<Record<string, string>> {
    return redis.hgetall(cartKey(userId));
  },

  /**
   * Suma `by` a la cantidad de un producto de forma atómica (HINCRBY).
   *
   * Si la cantidad resultante es `<= 0`, elimina el campo (spec §24/§6.4:
   * llegar a 0 quita el ítem) y renueva el TTL.
   *
   * @param {number} userId - Id del usuario.
   * @param {number} productId - Id del producto.
   * @param {number} by - Delta (+1 / -1).
   * @returns {Promise<number>} Cantidad resultante.
   */
  async increment(
    userId: number,
    productId: number,
    by: number,
  ): Promise<number> {
    const quantity = await redis.hincrby(
      cartKey(userId),
      String(productId),
      by,
    );
    if (quantity <= 0) {
      await redis.hdel(cartKey(userId), String(productId));
    }
    await redis.expire(cartKey(userId), TTL_SECONDS);
    return quantity;
  },

  /**
   * Elimina un producto del carrito.
   *
   * @param {number} userId - Id del usuario.
   * @param {number} productId - Id del producto.
   * @returns {Promise<number>} Campos eliminados (0 o 1).
   */
  remove(userId: number, productId: number): Promise<number> {
    return redis.hdel(cartKey(userId), String(productId));
  },

  /**
   * Vacía el carrito del usuario.
   *
   * @param {number} userId - Id del usuario.
   * @returns {Promise<number>} Claves eliminadas.
   */
  clear(userId: number): Promise<number> {
    return redis.del(cartKey(userId));
  },
};
