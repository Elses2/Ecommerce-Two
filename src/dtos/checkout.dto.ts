/**
 * @fileoverview DTOs del formulario de checkout (spec §6.5 / §19): la forma
 * exacta de los datos que entran y salen del endpoint de checkout. DTO = forma
 * de datos de un endpoint específico (spec §0) — el service/repository no los
 * conocen, solo el controller.
 */

/**
 * Método de pago aceptado por el checkout (spec §19).
 */
export type PaymentMethod = "transfer" | "cash_on_delivery" | "card";

/**
 * Payload de entrada del checkout: datos del formulario de envío/pago más el
 * token de idempotencia del carrito (spec §6.5 / §19).
 */
export interface CheckoutRequestDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  paymentMethod: PaymentMethod;
  checkoutToken: string;
}

/**
 * Resultado del checkout (unión discriminada por `ok`): éxito devuelve el
 * token/ID/total de la orden creada; fracaso devuelve la lista de errores de
 * validación (spec §19).
 */
export type CheckoutResultDto =
  | { ok: true; orderToken: string; orderId: number; total: number }
  | { ok: false; errors: string[] };