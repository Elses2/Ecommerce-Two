# Contexto de usuarios y auth — estado actual y traspaso

> Documento de contexto para la feature **Checkout real** (issue #68, SPEC
> §19). Explica por qué existe el usuario "guest" temporal, qué se toca cuando
> se implemente auth de verdad y qué se decidió **no** hacer hoy.
> Referencia viva: `spectsEccomerce/SPEC.md` (§1.1, §19).

## 1. Por qué existe este documento

`orders.user_id` es `INTEGER NOT NULL` con FK a `users(id) ON DELETE RESTRICT`
(spec §1.1): toda orden necesita un usuario. El checkout real (§19) se
implementó **antes** de que exista login/registro, así que la FK se satisface
con un usuario guest único. Este documento registra esa decisión (D5), los
nombres reales de archivos/funciones y qué hay que cambiar cuando llegue la
auth — para que nadie se encuentre el guest de sorpresa.

## 2. Estado actual del usuario

- **No hay auth**: no existe `user.service`, `user.controller` ni rutas de
  login/registro funcionales. `src/routes/api/auth.routes.ts` es un scaffold
  sin backend real (spec §14).
- La tabla `users` (spec §1.1) existe desde el inicio: `id`, `name`,
  `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `created_at`.
- La sesión (`express-session`, persistida en SQLite vía
  `better-sqlite3-session-store`, spec §11) se usa **solo** para el carrito
  (`req.session.cart`, spec §6.4). No hay concepto de "usuario logueado" en
  la sesión.

## 3. El parche guest (D5)

- **Archivo:** `src/repositories/user.repository.ts` (nuevo, único archivo
  del checkout que toca `users`).
- **Función:** `UserRepository.ensureGuestUser(): number` — busca por
  `email = 'guest@local'`; si no existe, inserta
  `('Guest', 'guest@local', '!')` y devuelve `lastInsertRowid`.
  Idempotente: la primera llamada crea la fila, las siguientes reutilizan el
  id. Está marcada `@deprecated` a propósito.
- **El `password_hash` es `'!'`**: deliberadamente inutilizable; no existe
  hashing todavía y nadie debe poder "loguearse" como guest.
- **Quién lo llama:** `CheckoutService.createOrder` (spec §19) antes de
  `orderRepository.placeOrder`.
- **Por qué funciona:** todas las órdenes quedan bajo el mismo `user_id`; no
  se expone al usuario final (la confirmación se accede por token, D7).

## 4. Qué cambiar cuando exista auth real

1. **Eliminar el guest**: borrar `user.repository.ts` y
   `checkoutService.createOrder` debe usar el usuario de la sesión
   (`req.session.user.id` o equivalente) en `PlaceOrderInput.userId`.
2. **`ensureGuestUser()` se va**: ninguna llamada debe quedar referenciándola
   (grep de `ensureGuestUser` en `src/` debe dar 0 resultados).
3. **Mantener la FK**: `orders.user_id` sigue apuntando a un usuario real;
   `ON DELETE RESTRICT` ya protege las órdenes.
4. **CSRF**: `POST /checkout` (y cualquier POST de auth) debe validar token
   CSRF cuando haya sesión de usuario (ver §7).
5. **Historial de compras**: con usuario real se puede listar
   `orders WHERE user_id = ?` (hoy no existe; fuera de alcance).

## 5. Cómo se accede a una orden hoy

- **Por token, no por id** (D7): `GET /checkout/confirmation/:token` →
  `CheckoutController.showConfirmation` → `CheckoutService.getOrderForConfirmation`
  → `OrderRepository.findByCheckoutToken` (+ `findItemsByOrderId`).
- El token es `^[a-f0-9]{32}$` (generado con `crypto.randomBytes(16)` en
  `CheckoutService.generateCheckoutToken`) y único vía
  `idx_orders_checkout_token` (spec §1.1 / §19.4).
- No existe ningún endpoint que liste órdenes por usuario, y
  `orders.user_id` no se usa para autorizar nada todavía.

## 6. Sesión vs JWT — pregunta abierta

Cuando se implemente auth hay que elegir el mecanismo. **Esta decisión queda
abierta a propósito**: no se resuelve en esta feature ni se inventa una
respuesta acá. Puntos a considerar para cuando se aborde:

- El proyecto ya tiene `express-session` con store SQLite (spec §11) — la
  sesión por cookie/session-store es el camino de menor fricción y el que ya
  conoce la base de código.
- El spec original mencionaba JWT como opción para la API; hoy no hay API de
  auth ni clientes que la consuman (el carrito usa sesión, §6.4).
- Si algún día hay app móvil u otro cliente, JWT (o un store compartido)
  gana puntos; para un monolito server-rendered, la sesión alcanza.

> **Pregunta abierta:** ¿sesión (cookie + store SQLite, consistente con el
> resto) o JWT? Decidir en la feature de auth, no antes.

## 7. Qué NO se hizo deliberadamente

- **CSRF**: no hay tokens CSRF en `POST /checkout` (ni en ningún POST del
  proyecto hoy). Anotado como deuda en SPEC §19.8; se resuelve junto con auth.
- **Password recovery / reset**: no existe; `password_hash` ni siquiera se
  hashea todavía.
- **Roles** (admin, cliente): la tabla `users` no tiene columna de rol; no se
  necesita para checkout.
- **Verificación de email**: no existe flujo de confirmación de email.
- **Cifrado o datos de tarjeta**: D9 — el checkout no pide ni guarda datos de
  pago; `payment_method` es solo preferencia.

## 8. Preguntas abiertas

- ¿Sesión o JWT? (ver §6 — abierta de forma deliberada).
- ¿El guest se migra a un usuario real o se descartan sus órdenes cuando
  exista auth? (Las órdenes `guest@local` quedarían huérfanas de dueño.)
- ¿El stock de órdenes `pending` se libera con una cancelación? (Deuda
  anotada en §19.8; hoy el stock queda "reservado".)
- ¿`price`/`total` pasan a `INTEGER` (centavos)? (Deuda anotada en §19.8.)
