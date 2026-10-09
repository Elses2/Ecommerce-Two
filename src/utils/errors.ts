/**
 * @fileoverview Errores tipados del flujo de checkout (spec §19): centralizan
 * los fallos de negocio que el service captura con `instanceof` para decidir
 * el resultado del endpoint. NO son errores de Express — no llevan `status` ni
 * pasan por el middleware de errores; se lanzan en la capa de repositorios y se
 * traducen a la respuesta HTTP arriba.
 */

/**
 * Error de stock insuficiente: se lanza cuando el decremento atómico de stock
 * no pudo aplicarse (spec §19 / D3). El service lo traduce a un mensaje de
 * validación para el usuario.
 */
export class OutOfStockError extends Error {
  /**
   * Crea el error con el nombre del producto sin stock suficiente.
   *
   * @param {string} name - Nombre del producto que no tiene stock suficiente.
   */
  constructor(name: string) {
    super(`El producto «${name}» no tiene stock suficiente`);
  }
}

/**
 * Error de producto inexistente: se lanza cuando un producto del carrito no
 * existe en la base de datos al momento del checkout (spec §19 / D4). El
 * service lo traduce a un mensaje de validación para el usuario.
 */
export class ProductNotFoundError extends Error {
  /**
   * Crea el error de producto no encontrado.
   */
  constructor() {
    super("Producto no encontrado");
  }
}