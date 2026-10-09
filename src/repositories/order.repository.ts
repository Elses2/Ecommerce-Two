import type BetterSqlite3 from "better-sqlite3";
import type { Order } from "../models/order.model.js";
import type { OrderItem } from "../models/orderItem.model.js";
import db from "../config/database.js";
import { ProductNotFoundError, OutOfStockError } from "../utils/errors.js";
import { productRepository } from "./product.repository.js";

/**
 * @fileoverview Repositorio de órdenes: único encargado del SQL sobre orders y
 * order_items. Crea la orden de checkout con sus items y el total de forma
 * atómica (spec §19): si algo falla a mitad de camino, la transacción revierte
 * TODO — ni la orden, ni los items, ni el stock se tocan a medias.
 */
export interface OrderLineInput {
  /** Identificador del producto a comprar. */
  productId: number;
  /** Cantidad de unidades del producto. */
  quantity: number;
}

/**
 * Entrada del checkout (spec §19): datos de envío/pago más las líneas del
 * carrito. Es la forma que consume el repository — el DTO del endpoint ya fue
 * validado y normalizado por el service.
 */
export interface PlaceOrderInput {
  /** Id del usuario (guest) que hace la orden — FK orders.user_id. */
  userId: number;
  /** Token de idempotencia del checkout; UNIQUE en orders (spec §1.1 / §19). */
  checkoutToken: string;
  shippingName: string;
  shippingEmail: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  /** Método de pago elegido en el formulario. */
  paymentMethod: string;
  /** Líneas del carrito: producto + cantidad. */
  lines: OrderLineInput[];
}

/**
 * Resultado de una orden colocada: id y total final (redondeado a 2 decimales).
 */
export interface PlacedOrder {
  orderId: number;
  total: number;
}

/**
 * Item de una orden con el nombre del producto (join a products).
 */
export interface OrderItemWithProduct extends OrderItem {
  /** Nombre del producto en el momento de la consulta (spec §19). */
  product_name: string;
}

/**
 * Repositorio de órdenes: único dueño de las consultas SQL de orders/order_items.
 */
export class OrderRepository {
  /**
   * Inicializa la instancia del repositorio de órdenes.
   *
   * @param {BetterSqlite3.Database} [database=db] - Instancia de la base de datos SQLite.
   */
  constructor(private database: BetterSqlite3.Database = db) {}

  /**
   * Crea la orden de checkout atómicamente y devuelve su id y total.
   *
   * Transacción BEGIN IMMEDIATE (spec §19 / D2-D3): toma el lock de escritura
   * de entrada, evitando SQLITE_BUSY por el upgrade read→write bajo
   * concurrencia multi-proceso. El callback es 100% síncrono (D1). Si algo
   * lanza (stock, producto inexistente, token duplicado), better-sqlite3
   * hace ROLLBACK automático y re-lanza — acá NO se escribe BEGIN/COMMIT/
   * ROLLBACK a mano. Orden estricto: 1) INSERT de la orden, 2) por línea:
   * leer precio desde la DB dentro de la transacción (D4), decrementar stock
   * atómico (D3), insertar el item con unit_price congelado (spec §1.1),
   * 3) UPDATE del total redondeado a 2 decimales (price es REAL).
   *
   * @param {PlaceOrderInput} input - Datos de envío/pago y líneas del carrito.
   * @returns {PlacedOrder} Id y total (redondeado) de la orden creada.
   * @throws {ProductNotFoundError} Si un producto del carrito ya no existe.
   * @throws {OutOfStockError} Si no hay stock suficiente para alguna línea.
   */
  placeOrder(input: PlaceOrderInput): PlacedOrder {
    return this.database
      .transaction(() => {
        // 1) La orden nace 'pending' con total 0 (spec §1.1); status se inserta
        // como literal SQL, nunca como parámetro — 'pending' es un OrderStatus
        // válido sin necesidad de castear.
        const orderInfo = this.database
          .prepare(
            `INSERT INTO orders
               (user_id, status, total, checkout_token,
                shipping_name, shipping_email, shipping_phone,
                shipping_address, shipping_city, shipping_postal_code,
                shipping_country, payment_method)
             VALUES (?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.userId,
            input.checkoutToken,
            input.shippingName,
            input.shippingEmail,
            input.shippingPhone,
            input.shippingAddress,
            input.shippingCity,
            input.shippingPostalCode,
            input.shippingCountry,
            input.paymentMethod,
          );
        const orderId = Number(orderInfo.lastInsertRowid);

        // 2) Líneas: precio SIEMPRE desde la DB dentro de la transacción (D4).
        let total = 0;
        for (const line of input.lines) {
          const product = this.database
            .prepare("SELECT id, name, price FROM products WHERE id = ?")
            .get(line.productId) as
            | { id: number; name: string; price: number }
            | undefined;
          if (!product) {
            throw new ProductNotFoundError();
          }

          // Decremento atómico reusando el repositorio de productos (D3).
          if (!productRepository.decrementStockIfAvailable(product.id, line.quantity)) {
            throw new OutOfStockError(product.name);
          }

          // unit_price congelado al momento de la compra (spec §1.1).
          this.database
            .prepare(
              `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
               VALUES (?, ?, ?, ?)`,
            )
            .run(orderId, product.id, line.quantity, product.price);

          total += product.price * line.quantity;
        }

        // 3) Total redondeado a 2 decimales (price es REAL).
        const roundedTotal = Math.round(total * 100) / 100;
        this.database
          .prepare("UPDATE orders SET total = ? WHERE id = ?")
          .run(roundedTotal, orderId);

        return { orderId, total: roundedTotal };
      })
      .immediate();
  }

  /**
   * Busca una orden por su token de checkout (idempotencia, spec §19).
   *
   * El status llega de la DB como string; el cast a Order hace el rol de
   * toOrderStatus — los valores escritos por placeOrder son siempre literales
   * válidos del tipo.
   *
   * @param {string} token - Token único de idempotencia del checkout.
   * @returns {Order | undefined} La orden encontrada o `undefined` si no existe.
   */
  findByCheckoutToken(token: string): Order | undefined {
    return this.database
      .prepare("SELECT * FROM orders WHERE checkout_token = ?")
      .get(token) as unknown as Order | undefined;
  }

  /**
   * Lista los items de una orden con el nombre de cada producto.
   *
   * @param {number} orderId - Identificador único de la orden.
   * @returns {OrderItemWithProduct[]} Items de la orden con `product_name`.
   */
  findItemsByOrderId(orderId: number): OrderItemWithProduct[] {
    return this.database
      .prepare(
        `SELECT oi.*, p.name AS product_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
      )
      .all(orderId) as unknown as OrderItemWithProduct[];
  }
}

/** Instancia singleton de `OrderRepository`. */
export const orderRepository = new OrderRepository();