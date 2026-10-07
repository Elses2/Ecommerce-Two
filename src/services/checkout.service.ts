import { randomBytes } from "node:crypto";
import type { CheckoutRequestDto, CheckoutResultDto, PaymentMethod } from "../dtos/checkout.dto.js";
import type { Order } from "../models/order.model.js";
import { OrderRepository, orderRepository } from "../repositories/order.repository.js";
import type { OrderItemWithProduct, OrderLineInput } from "../repositories/order.repository.js";
import { UserRepository, userRepository } from "../repositories/user.repository.js";
import { OutOfStockError, ProductNotFoundError } from "../utils/errors.js";

// Servicio PURO del checkout (spec §19): valida el formulario, delega la
// creación atómica en el repositorio de órdenes y traduce los errores de
// negocio a mensajes del usuario. Sin SQL y sin express acá; el estado de la
// sesión (carrito) lo maneja el controller — el service solo recibe líneas.
//
// Métodos de pago aceptados (D9: solo preferencia, no se procesa ningún pago).
const PAYMENT_METHODS: PaymentMethod[] = ["transfer", "cash_on_delivery", "card"];

// Email pragmático: algo@algo.algo (spec §19; el registro usa el mismo criterio).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Token de idempotencia: 16 bytes aleatorios en hex = 32 chars [a-f0-9] (D6).
const CHECKOUT_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Normaliza un valor de formulario a string recortado.
 *
 * El body de Express llega como strings, pero la defensa en profundidad
 * (spec §19) evita que un valor inesperado rompa la validación: cualquier
 * cosa que no sea string se trata como vacío.
 *
 * @param {unknown} value - Valor crudo del formulario.
 * @returns {string} El valor recortado, o `""` si no era un string.
 */
function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Detecta el error UNIQUE de SQLite (D6).
 *
 * `better-sqlite3` lanza `SqliteError` con `code === "SQLITE_CONSTRAINT_UNIQUE"`
 * cuando el `checkout_token` ya existe. La detección es estructural (sin
 * importar el paquete) para mantener el service libre de dependencias de DB.
 *
 * @param {unknown} error - Error capturado en el try/catch de createOrder.
 * @returns {boolean} `true` si es la violación del índice único de checkout_token.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export class CheckoutService {
  /**
   * Crea una instancia de CheckoutService con los repositorios inyectados.
   *
   * @param {OrderRepository} [orders=orderRepository] - Repositorio de órdenes.
   * @param {UserRepository} [users=userRepository] - Repositorio de usuarios (guest).
   */
  constructor(
    private orders: OrderRepository = orderRepository,
    private users: UserRepository = userRepository,
  ) {}

  /**
   * Valida el formulario de checkout y devuelve los errores en español.
   *
   * Reglas (spec §19): campos obligatorios sin espacios al inicio/final,
   * email con formato, teléfono de 7 a 15 dígitos (ignora espacios, `+`, `-`
   * y paréntesis), método de pago en la lista permitida (D9) y token de
   * idempotencia con formato de 32 hex (D6).
   *
   * @param {CheckoutRequestDto} dto - Payload crudo del formulario de checkout.
   * @returns {string[]} Lista de mensajes de error; vacía si todo es válido.
   */
  validateCheckoutInput(dto: CheckoutRequestDto): string[] {
    const errors: string[] = [];
    const firstName = toTrimmed(dto.firstName);
    const lastName = toTrimmed(dto.lastName);
    const email = toTrimmed(dto.email);
    const phone = toTrimmed(dto.phone);
    const address = toTrimmed(dto.address);
    const city = toTrimmed(dto.city);
    const postalCode = toTrimmed(dto.postalCode);
    const country = toTrimmed(dto.country);

    if (!firstName) errors.push("El nombre es obligatorio");
    else if (firstName.length > 100) errors.push("El nombre no puede superar los 100 caracteres");

    if (!lastName) errors.push("El apellido es obligatorio");
    else if (lastName.length > 100) errors.push("El apellido no puede superar los 100 caracteres");

    if (!email) errors.push("El email es obligatorio");
    else if (email.length > 254) errors.push("El email no puede superar los 254 caracteres");
    else if (!EMAIL_PATTERN.test(email)) errors.push("El email no tiene un formato válido");

    // Dígitos del teléfono ignorando espacios, +, - y paréntesis.
    const phoneDigits = phone.replace(/[\s+\-()]/g, "");
    if (!phone) errors.push("El teléfono es obligatorio");
    else if (!/^\d{7,15}$/.test(phoneDigits)) {
      errors.push("El teléfono debe tener entre 7 y 15 dígitos");
    }

    if (!address) errors.push("La dirección es obligatoria");
    else if (address.length > 200) errors.push("La dirección no puede superar los 200 caracteres");

    if (!city) errors.push("La ciudad es obligatoria");
    else if (city.length > 200) errors.push("La ciudad no puede superar los 200 caracteres");

    if (!postalCode) errors.push("El código postal es obligatorio");
    else if (postalCode.length > 20) {
      errors.push("El código postal no puede superar los 20 caracteres");
    }

    if (!country) errors.push("El país es obligatorio");
    else if (country.length > 200) errors.push("El país no puede superar los 200 caracteres");

    if (!PAYMENT_METHODS.includes(dto.paymentMethod)) {
      errors.push("El método de pago no es válido");
    }
    if (!CHECKOUT_TOKEN_PATTERN.test(dto.checkoutToken)) {
      errors.push("El token de checkout no es válido");
    }

    return errors;
  }

  /**
   * Crea la orden de checkout de forma atómica e idempotente.
   *
   * Flujo (spec §19 / D1-D9): valida el formulario → rechaza carrito vacío →
   * garantiza el usuario guest (D5) → delega en `placeOrder` (transacción
   * BEGIN IMMEDIATE, precios desde DB dentro de la transacción, stock atómico).
   * Errores de negocio (`OutOfStockError`, `ProductNotFoundError`) se traducen
   * a mensajes del usuario; la violación del índice UNIQUE de `checkout_token`
   * (D6) NO es un error: es un reenvío del mismo formulario, así que se
   * devuelve la orden ya existente (idempotencia). Cualquier otro error se
   * re-lanza para el middleware de errores (spec §6.2).
   *
   * @param {OrderLineInput[]} lines - Líneas del carrito (solo productId/quantity).
   * @param {CheckoutRequestDto} dto - Datos de envío/pago validados.
   * @returns {CheckoutResultDto} `{ ok: true, ... }` con la orden, o `{ ok: false, errors }`.
   * @throws {Error} Re-lanza errores no esperados (DB, etc.) para el middleware.
   */
  createOrder(lines: OrderLineInput[], dto: CheckoutRequestDto): CheckoutResultDto {
    const errors = this.validateCheckoutInput(dto);
    if (errors.length > 0) {
      return { ok: false, errors };
    }
    if (lines.length === 0) {
      return { ok: false, errors: ["El carrito está vacío"] };
    }

    const userId = this.users.ensureGuestUser();
    try {
      const placed = this.orders.placeOrder({
        userId,
        checkoutToken: dto.checkoutToken,
        shippingName: toTrimmed(dto.firstName),
        shippingEmail: toTrimmed(dto.email),
        shippingPhone: toTrimmed(dto.phone),
        shippingAddress: toTrimmed(dto.address),
        shippingCity: toTrimmed(dto.city),
        shippingPostalCode: toTrimmed(dto.postalCode),
        shippingCountry: toTrimmed(dto.country),
        paymentMethod: dto.paymentMethod,
        lines,
      });
      return {
        ok: true,
        orderToken: dto.checkoutToken,
        orderId: placed.orderId,
        total: placed.total,
      };
    } catch (error) {
      if (error instanceof OutOfStockError || error instanceof ProductNotFoundError) {
        return { ok: false, errors: [error.message] };
      }
      if (isUniqueConstraintError(error)) {
        // Reenvío del mismo formulario (D6): devolver la orden ya creada.
        const existing = this.orders.findByCheckoutToken(dto.checkoutToken);
        if (existing) {
          return {
            ok: true,
            orderToken: dto.checkoutToken,
            orderId: existing.id,
            total: existing.total,
          };
        }
      }
      throw error;
    }
  }

  /**
   * Busca una orden por su token para la página de confirmación (D7).
   *
   * El token identifica la orden (nunca se expone `orders.id`); el controller
   * valida el formato ANTES de llamar acá. Se devuelve la orden con sus items
   * (unit_price congelado, spec §1.1) para el render de confirmación.
   *
   * @param {string} token - Token de checkout de la orden (32 hex).
   * @returns {{ order: Order; items: OrderItemWithProduct[] } | undefined} Orden con items, o `undefined` si no existe.
   */
  getOrderForConfirmation(
    token: string,
  ): { order: Order; items: OrderItemWithProduct[] } | undefined {
    const order = this.orders.findByCheckoutToken(token);
    if (!order) {
      return undefined;
    }
    const items = this.orders.findItemsByOrderId(order.id);
    return { order, items };
  }

  /**
   * Genera el token de idempotencia del checkout (D6).
   *
   * 16 bytes aleatorios en hex = 32 caracteres `[a-f0-9]`, que es el formato
   * que exige la validación y el índice UNIQUE de `orders.checkout_token`.
   *
   * @returns {string} Token hexadecimal de 32 caracteres.
   */
  generateCheckoutToken(): string {
    return randomBytes(16).toString("hex");
  }
}

/** Instancia singleton de `CheckoutService`. */
export const checkoutService = new CheckoutService();
