// Modelo de la tabla orders (spec §1.1): el checkout crea la orden atómicamente
// con estado, total, token de idempotencia y datos de envío/pago (spec §19).
// status/total tienen default en DB; el resto de columnas nuevas son nullable.

/**
 * Estado del ciclo de vida de una orden (spec §1.1).
 */
export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

/**
 * Forma de una fila de la tabla orders (spec §1.1).
 */
export interface Order {
  id: number;
  user_id: number;
  created_at: string | null;
  /** Estado actual de la orden (default en DB: 'pending'). */
  status: OrderStatus;
  /** Total de la orden; unit_price queda congelado en order_items (spec §1.1). */
  total: number;
  /** Token único de idempotencia del checkout; null hasta confirmar la orden. */
  checkout_token: string | null;
  shipping_name: string | null;
  shipping_email: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  payment_method: string | null;
}
