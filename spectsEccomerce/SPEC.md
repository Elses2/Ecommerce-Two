# SPEC — Especificación técnica viva de MiEcommerce

> **Este es el único documento de especificación que se edita.**
> Describe el proyecto **tal como es hoy** y es la fuente de verdad a la que
> apuntan los comentarios del código (`spec §X.Y`).
>
> El resto de los `.md` en `spectsEccomerce/` son **históricos**: registran qué
> pasó y cuándo, pero no se actualizan ni deben usarse como referencia de
> implementación.
>
> - Última actualización: **2026-10-07** (card de producto enlazada al detalle)
> - Rama base de referencia: `dev`

---

## Índice

| § | Sección | Estado |
|---|---|---|
| [§0](#0-contexto-del-proyecto) | Contexto del proyecto | Vigente |
| [§1](#1-base-de-datos--esquema-actual) | Base de datos — esquema actual | Vigente |
| [§1.1](#11-esquema) | Esquema | Vigente |
| [§1.2](#12-corrección-de-arquitectura-obligatoria-categorías-es-nm) | Corrección de arquitectura: categorías N:M | Vigente |
| [§1.3](#13-atributos-derivados) | Atributos derivados | Vigente |
| [§1.4](#14-migración-de-datos) | Migración de datos | Reemplazado (seed) |
| [§2](#2-imágenes-de-producto--fallback-configurable) | Imágenes de producto — fallback configurable | Reemplazado (era Cloudinary) |
| [§2.1](#21-config) | Config | Reemplazado |
| [§2.2](#22-escenarios-de-uso) | Escenarios de uso | Reemplazado |
| [§2.3](#23-helper-de-fallback) | Helper de fallback | Reemplazado |
| [§3](#3-sistema-de-diseño--mapeo-de-componentes) | Sistema de diseño — mapeo de componentes | Vigente |
| [§4](#4-mapeo-de-páginas) | Mapeo de páginas | Vigente |
| [§4.1](#41-home) | Home | Vigente |
| [§4.2](#42-carrito) | Carrito | Vigente |
| [§4.3](#43-detalle-de-producto) | Detalle de producto | Vigente |
| [§4.4](#44-login) | Login | Vigente |
| [§4.5](#45-register) | Register | Vigente |
| [§4.6](#46-páginas-sin-mockup-todavía) | Páginas sin mockup | Vigente |
| [§5](#5-contrato-de-atributos-data-) | Contrato de atributos `data-*` | Vigente |
| [§6](#6-funcionalidades-implementadas) | Funcionalidades implementadas | Vigente |
| [§6.1](#61-página-404) | Página 404 | Vigente |
| [§6.2](#62-página-500) | Página 500 | Vigente |
| [§6.3](#63-validación-de-formulario-de-registro) | Validación de registro (frontend) | Vigente |
| [§6.4](#64-carrito-en-sesión) | Carrito en sesión | Vigente (con persistencia SQLite, ver §11) |
| [§6.5](#65-checkout-temporal) | Checkout temporal | Vigente |
| [§6.6](#66-home--te-puede-interesar) | Home — "Te puede interesar" | Vigente |
| [§6.6b](#66b-home--nav-de-categorías-y-banners-promocionales) | Home — Nav de categorías y banners | Vigente |
| [§6.7](#67-home--los-más-pedidos) | Home — "Los más pedidos" | Vigente |
| [§6.8](#68-detalle-de-producto-productsid) | Detalle de producto `/products/:id` | Vigente |
| [§6.9](#69-normalización-de-ids) | Normalización de IDs | Vigente |
| [§6.10](#610-indicador-sin-stock) | Indicador "Sin stock" | Vigente |
| [§6.11](#611-total-del-carrito-en-el-header) | Total del carrito en el header | Vigente |
| [§6.12](#612-ordenar-productos-por-precio) | Ordenar por precio `/products?sort=` | Vigente |
| [§6.13](#613-buscador-de-productos) | Buscador `/search?query=` | Vigente |
| [§6.14](#614-layout-base) | Layout base | Vigente |
| [§7](#7-checklist-de-pasos--histórico) | Checklist de pasos | Histórico (completado) |
| [§8](#8-fase-futura-no-implementar-ahora-tiempo-real-con-websockets) | Fase futura: WebSockets | Vigente (futuro, no implementado) |
| [§9](#9-checklist-de-validación-general) | Checklist de validación general | Vigente |
| [§10](#10-swagger--openapi-en-apidocs) | Swagger / OpenAPI en `/api-docs` | Nuevo |
| [§11](#11-persistencia-de-sesión-en-sqlite) | Persistencia de sesión en SQLite | Nuevo |
| [§12](#12-script-de-seed-idempotente) | Script de seed idempotente | Nuevo |
| [§13](#13-gitattributes-normalización-eol) | `.gitattributes` normalización EOL | Nuevo |
| [§14](#14-estructura-de-directorios-actual) | Estructura de directorios actual | Nuevo |
| [§15](#15-árbol-atómico-de-views-y-view-root-único) | Árbol atómico de views + view root único | Nuevo |
| [§16](#16-variables-de-entorno) | Variables de entorno | Nuevo |
| [§17](#17-documentación-generada-docs) | Documentación generada (`docs/`) | Nuevo |
| [§18](#18-convención-de-comentarios-jsdoc) | Convención de comentarios JSDoc | Nuevo |

---

## §0. Contexto del proyecto

El proyecto es un monolito **TypeScript + Express + EJS**, con arquitectura
en capas para el backend y **Atomic Design** para las vistas — ambas
conviven en el mismo árbol:

```
src/
├── app.ts
├── config/
│   ├── database.ts
│   ├── env.ts
│   └── swagger.ts
├── controllers/
│   ├── pages/
│   └── api/
├── services/
├── repositories/
├── models/
├── dtos/
├── middlewares/
├── routes/
│   ├── pages.routes.ts
│   ├── docs.routes.ts
│   └── api/
├── utils/
└── views/
    └── templates/              ← layout + árbol atómico (ver §15)

spectsEccomerce/                 ← NO es parte de src/, es material de referencia
├── SPEC.md                     ← ESTE documento (fuente de verdad viva)
└── *.md                        ← históricos (ver tabla de equivalencias)
```

**Regla de clasificación (no purista, con criterio):** un componente entra
en `atoms/` o `molecules/` solo si se reutiliza en 2+ lugares. Si un
elemento aparece una sola vez, va inline en el `organism`/`page` que lo
contiene — no crear un archivo por cada pixel suelto. La clasificación
completa componente por componente está en la sección 3.

Reglas ya acordadas que **deben respetarse** en todo lo que sigue:

- **Controller** → orquesta, nunca contiene lógica de negocio ni queries.
- **Service** → lógica de negocio pura, no conoce Express ni SQL.
- **Repository** → único lugar que sabe de dónde vienen los datos
  (SQLite vía `better-sqlite3`, síncrono).
- **Model** → solo forma de los datos (interfaces).
- **DTO** → forma de los datos que entra/sale por un endpoint específico.
- **Atom/Molecule** → sin datos reales, reciben todo por props/variables EJS.
- **Organism** → puede tener datos reales inyectados por el controller.
- `routes/api/*` **solo** existe para funcionalidades que necesitan
  actualizar la pantalla sin recargar (AJAX real: carrito). Todo lo demás
  usa `res.render` / `res.redirect` desde `controllers/pages`.
- La API se documenta con Swagger en `/api-docs` (ver §10).

---

## §1. Base de datos — esquema actual

### §1.1 Esquema

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL
);

-- Relación N:M productos <-> categorías
CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER,
    category_id INTEGER,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- unit_price queda "congelado" al momento de la compra (no recalcular contra products.price)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
```

Índices UNIQUE adicionales (habilitan el `INSERT OR IGNORE` del seed):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
```

`users` y `orders`/`order_items` se crean ya en esta etapa pero **no se
implementa login ni checkout real todavía** — son tablas preparadas para
más adelante. El bootstrap DDL es aditivo en el arranque
(`src/config/database.ts`, `bootstrapSchema`), con pragmas
`journal_mode = WAL` y `foreign_keys = ON`.

### §1.2 Corrección de arquitectura obligatoria: categorías es N:M

La relación productos ↔ categorías es N:M vía `product_categories` con PK
compuesta y FKs. El repository accede a las categorías de un producto con
`findCategoriesByProduct`.

### §1.3 Atributos derivados

| Atributo derivado | Origen | Dónde se calcula |
|---|---|---|
| `inStock` (boolean) | `stock > 0` | `product.service.ts` |
| `categories` (array) | JOIN `product_categories` | `product.service.ts` (`findCategoriesByProduct`) |
| `subtotal` de un ítem de carrito | `quantity * price` real (nunca confiar en el cliente) | `cart.service.ts` |
| `total` del carrito | suma de subtotales | `cart.service.ts` |
| `total` de una orden | suma de `order_items.quantity * unit_price` | `order.service.ts` (futuro) |
| `imageUrl` con fallback | si `image_url` es null/vacío, usar `env.images.fallbackUrl` | `product.service.ts` (ver §2.3) |

### §1.4 Migración de datos

> ⚠️ **Reemplazado.** El spec original describía leer un JSON de productos
> y migrarlo. Ese JSON ya no existe; la carga inicial la hace el script
> idempotente `scripts/seed.ts` (ver §12). No hay migración manual.

---

## §2. Imágenes de producto — fallback configurable

> ⚠️ **Reemplazado.** Esta sección documentaba la integración con
> **Cloudinary**, eliminada en el PR #71. La solución vigente usa una URL de
> fallback configurable por entorno.

### §2.1 Config

El fallback de imagen se configura con la variable de entorno
`FALLBACK_IMAGE_URL` (ver §16), leída por `src/config/env.ts`:

```typescript
// src/config/env.ts
const DEFAULT_FALLBACK_IMAGE_URL =
  "https://placehold.co/600x600?text=Sin+imagen";

function parseImageUrl(rawValue: string | undefined): string {
  const v = rawValue?.trim();
  if (!v) return DEFAULT_FALLBACK_IMAGE_URL;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return v;
  } catch {
    /* cae al warning */
  }
  console.warn("[env] FALLBACK_IMAGE_URL inválida, usando valor por defecto");
  return DEFAULT_FALLBACK_IMAGE_URL;
}
```

Se expone a las vistas vía `app.locals.fallbackImageUrl` en `src/app.ts`.

### §2.2 Escenarios de uso

- **Solo lectura (aplica hoy):** los productos pueden tener `image_url`
  NULL, vacío o una URL externa (p. ej. placehold.co u otro host). Si la
  URL es NULL/vacía, el servicio la reemplaza por `env.images.fallbackUrl`.
  Si la URL existe pero devuelve 404 (rota), el `onerror` del `<img>` la
  reemplaza por el fallback.
- **Carga real de imágenes (fase futura, NO implementar todavía):** un form
  de alta/edición de producto que suba un archivo y guarde la URL en
  `products.image_url`. Requiere un CRUD de productos que hoy no existe.

### §2.3 Helper de fallback

```typescript
// src/services/product.service.ts
export function withImageFallback(product: Product): Product & { image_url: string } {
  return {
    ...product,
    image_url: product.image_url?.trim() ? product.image_url : env.images.fallbackUrl,
  };
}
```

Se aplica en **todo** lugar donde se devuelvan productos a una vista (home,
listado, detalle, relacionados, sugeridos). La firma pública es estable;
las vistas reciben `imageUrl` ya resuelta.

**Fallback para imágenes rotas (onerror):** todos los `<img>` de producto
y banner llevan:

```html
<img
  src="<%= product.imageUrl %>"
  alt="<%= product.name %>"
  onerror="this.onerror=null;this.src='<%= fallbackImageUrl %>'"
/>
```

`this.onerror=null` evita bucle infinito si el fallback también falla.
Templates con el patrón: `molecules/product.ejs`, `molecules/product-row.ejs`,
`organisms/product-hero.ejs`, `organisms/cart-item.ejs`,
`pages/product-detail.ejs`.

---

## §3. Sistema de diseño — mapeo de componentes

El árbol atómico vive en `src/views/templates/` (ver §15 para el view root
único). La tabla mapea cada componente a su partial `.ejs` y dónde se usa:

| Partial (`templates/...`) | Qué es | Tipo | Usado en |
|---|---|---|---|
| `atoms/profile-pic.ejs` | Círculo de foto de usuario, sin nombre | atom | dentro de `profile-btn.ejs`, `menu-desktop.ejs`, `menu-mobile.ejs` |
| `atoms/badge-counter.ejs` | Círculo rojo numérico | atom | dentro de `cart-icon.ejs` — mapea a `data-cart-count` |
| `atoms/input.ejs` | Input de texto, variantes claro/oscuro | atom | Login, Register |
| `atoms/menu-item.ejs` | Un ítem de menú suelto (ej. "Inicio") | atom | dentro de `menu-desktop.ejs`/`menu-mobile.ejs` |
| `molecules/search.ejs` | Input de búsqueda + ícono de lupa | molecule | `header.ejs`, `header-mobile.ejs` |
| `molecules/profile-btn.ejs` | `atoms/profile-pic.ejs` + nombre | molecule | dentro de `header-right.ejs` |
| `molecules/cart-icon.ejs` | Ícono de carrito + `atoms/badge-counter.ejs` | molecule | dentro de `header-right.ejs` |
| `molecules/header-right.ejs` | `cart-icon.ejs` + `profile-btn.ejs` | molecule | dentro de `organisms/header.ejs` |
| `molecules/numeric.ejs` | Control de cantidad `- N +` | molecule | dentro de `organisms/cart-item.ejs` — botones mapean a `data-cart-action` |
| `molecules/breadcrumb.ejs` | "← Volver al Listado > Category" | molecule | Categoría, Detalle de producto |
| `molecules/product-row.ejs` | Producto en fila horizontal compacta | molecule | sin página asignada todavía (futuro Historial/Mis Compras/Favoritos) |
| `molecules/product.ejs` | Card de producto (imagen + nombre + precio + botón); el nombre es un link extendido a `/products/:id` (§6.8) | molecule | dentro de `organisms/product-grid.ejs` |
| `organisms/header.ejs` | `search.ejs` + `header-right.ejs` + logo | organism | todas las páginas |
| `organisms/header-mobile.ejs` | Header mobile compacto | organism | todas las páginas, breakpoint mobile |
| `organisms/footer.ejs` | Footer desktop | organism | todas las páginas |
| `organisms/footer-mobile.ejs` | Footer mobile | organism | todas las páginas, breakpoint mobile |
| `organisms/categories-nav.ejs` | Barra horizontal de categorías con ícono | organism | Home (x2), filtro de listado |
| `organisms/categories-dropdown.ejs` | Lista vertical de categorías, fondo oscuro | organism | menú mobile / filtro lateral |
| `organisms/product-hero.ejs` | Banner grande con imagen + overlay + texto | organism | carrusel de Home (`banners`, §6.6b) |
| `organisms/product-grid.ejs` | Grilla de productos con título (envuelve N `molecules/product.ejs`) | organism | "Te puede interesar", "Los más pedidos", Categoría, Relacionados — **un solo componente, cuatro usos** |
| `organisms/cart-item.ejs` | Fila del carrito: imagen, nombre, "Quitar", `numeric.ejs`, precio | organism | `/cart` — raíz con `data-cart-item` |
| `organisms/dialog.ejs` | Modal genérico: título, cuerpo, botón secundario + primario | organism | sin uso en el alcance actual — listo para futuro |
| `organisms/menu-desktop.ejs` | Dropdown de usuario: avatar+nombre + `atoms/menu-item.ejs` | organism | se abre desde `ProfileBtn` — bonus/futuro |
| `organisms/menu-mobile.ejs` | Igual, versión fullscreen/mobile | organism | análogo mobile |
| `templates/layout.ejs` | Shell: header + slot + footer | layout | todas las páginas vía `express-ejs-layouts` |

Clases utilitarias definidas en `src/styles.css` (Tailwind): `.btn-primary`,
`.btn-secondary`, `.btn-disabled`, `.badge`, `.badge-out-of-stock`, guía
tipográfica `h1/h2/h3`.

---

## §4. Mapeo de páginas

### §4.1 Home

Una sola vista `pages/index.ejs`, orden de arriba hacia abajo:

| # | Bloque | Organism | Dato (`pages.controller.getHome`) |
|---|---|---|---|
| 1 | Header | `organisms/header.ejs` | `cartCount` (vía `injectCartCount`) |
| 2 | Nav de categorías (arriba) | `organisms/categories-nav.ejs` | `categories` |
| 3 | Carrusel de banners promocionales | `organisms/product-hero.ejs` | `banners` (`promoService.getActiveBanners()`, §6.6b) |
| 4 | "Te puede interesar" | `organisms/product-grid.ejs` | `suggested` (§6.6) |
| 5 | "Los más pedidos" | mismo `product-grid.ejs` | `mostOrdered` (§6.7) |
| 6 | Nav de categorías (abajo) | misma instancia de `categories-nav.ejs` | `categories` (mismo dato) |
| 7 | Footer | `organisms/footer.ejs` | estático |

### §4.2 Carrito

| Bloque | Organism | Dato / atributo |
|---|---|---|
| Header | `organisms/header.ejs` | `cartCount` |
| Link "Volver" | — | `<a href="/">← Volver</a>` |
| Lista de ítems | `organisms/cart-item.ejs` × N | `items` — cada fila `data-cart-item="<productId>"` |
| Total | — | `total` → `data-cart-total` |
| Botón "Ir a Pagar" | `.btn-primary` | link a `/checkout`, no AJAX |
| Footer | `organisms/footer.ejs` | estático |

Si `items` está vacío: bloque `data-cart-empty` con mensaje amigable +
botón volver al inicio.

### §4.3 Detalle de producto

| Bloque | Organism | Dato |
|---|---|---|
| Header | `organisms/header.ejs` | `cartCount` |
| Breadcrumb | `molecules/breadcrumb.ejs` | nombre de categoría + producto |
| Info principal | imagen + nombre + precio + descripción + categorías | `product` (§6.8) |
| Badge "Sin stock" | `.badge-out-of-stock` | `!product.inStock` (§6.10) |
| Botón "Agregar al carrito" | `.btn-primary`, disabled si sin stock | `data-cart-action="add"` `data-product-id` |
| Productos relacionados | `organisms/product-grid.ejs` | `related` (hasta 4, §6.8) |
| Footer | `organisms/footer.ejs` | estático |

### §4.4 Login

Banda superior color teal a todo el ancho, tarjeta blanca centrada: título
"¡Hola!", `atoms/input.ejs` × 2 (usuario/contraseña), botón primario
"Iniciar Sesión", link "¿No tienes cuenta? Regístrate" → `/register`.

El input de usuario es `type="email" name="email"` por dentro (la tabla
`users` solo tiene `email`, no `username`); el texto visible puede decir
"usuario", es cosmético.

### §4.5 Register

Mismo lenguaje visual que Login (banda teal + tarjeta centrada). Los
`name`/`id` de los inputs son exactamente `name`, `lastname`, `email`,
`password` (sin confirmación) porque `register-validation.js` (§6.3) los
referencia por esos nombres.

### §4.6 Páginas sin mockup todavía

- **Categoría** (`/categories/:id`): `organisms/product-grid.ejs` con
  `molecules/breadcrumb.ejs` arriba y título del nombre de categoría.
  Mensaje amigable si no hay productos.
- **Checkout** (`/checkout`): vista simple centrada, mensaje "Checkout
  disponible en el próximo sprint" + dos botones (volver al carrito /
  volver al inicio). Placeholder deliberado (§6.5).
- **404 / 500**: página centrada, mensaje corto, botón volver al inicio
  (§6.1, §6.2).
- **Listado de productos** (`/products?sort=`): `organisms/product-grid.ejs`
  reutilizado (§6.12).
- **Resultados de búsqueda** (`/search?query=`): `product-grid.ejs`
  reutilizado (§6.13).

---

## §5. Contrato de atributos `data-*`

Todo elemento interactivo necesita estos atributos exactos para que
`cart.js` pueda encontrar y actualizar el DOM sin recargar la página. Se
generan **junto con** el HTML del componente:

| Componente | Atributo | Dónde va | Usado por |
|---|---|---|---|
| Card de producto | `data-product-id="<id>"` | contenedor raíz de `molecules/product.ejs` | futuros JS |
| Botón agregar al carrito | `data-cart-action="add"` `data-product-id="<id>"` | `<button>` en `molecules/product.ejs` | `cart.js` |
| Fila de ítem en `/cart` | `data-cart-item="<productId>"` | contenedor raíz de `organisms/cart-item.ejs` | `cart.js` (`updateCartUI`) |
| Cantidad del ítem | `data-quantity` | `<span>` en `molecules/numeric.ejs` | `cart.js` |
| Subtotal del ítem | `data-subtotal` | `<span>` en `organisms/cart-item.ejs` | `cart.js` |
| Botón `+` | `data-cart-action="increase"` `data-product-id="<id>"` | `<button>` en `molecules/numeric.ejs` | `cart.js` |
| Botón `-` | `data-cart-action="decrease"` `data-product-id="<id>"` | `<button>` en `molecules/numeric.ejs` | `cart.js` |
| Botón "Quitar" | `data-cart-action="remove"` `data-product-id="<id>"` | `<button>` en `organisms/cart-item.ejs` | `cart.js` |
| Botón "Vaciar carrito" | `data-cart-action="clear"` | `<button>` en `pages/cart.ejs` | `cart.js` |
| Total del carrito | `data-cart-total` | `<span>` del total en `pages/cart.ejs` | `cart.js` |
| Contador del header | `data-cart-count` | `atoms/badge-counter.ejs` → `cart-icon.ejs` → `header-right.ejs` → `header.ejs` | `cart.js` y middleware `injectCartCount` |
| Mensaje de carrito vacío | `data-cart-empty` (con clase `hidden` por defecto) | `pages/cart.ejs` | `cart.js` |

> **Nota — link extendido (2026-10-07):** la card de producto
> (`molecules/product.ejs`) contiene un `<a href="/products/<id>">` en el
> nombre cuyo `::after` (`after:absolute after:inset-0 after:content-['']`)
> cubre toda la card: imagen, nombre y precio navegan al detalle (§6.8).
> El botón `data-cart-action="add"` va por encima del link (`relative z-10`)
> y **no** navega — lo sigue manejando `cart.js` (§6.4).

Cualquier `id`/`class` adicional por estética es libre — los `data-*` son
aditivos.

---

## §6. Funcionalidades implementadas

### §6.1 Página 404

**No es AJAX.** Middleware catch-all en `app.ts` (`handleNotFound`),
después de montar todas las rutas. Para `/api/*` responde JSON
`{ error: "Not found" }`; para el resto, renderiza
`templates/pages/404` con status 404.

### §6.2 Página 500

**No es AJAX.** `middlewares/error-handler.middleware.ts`, montado al final
de `app.ts` después del 404. Loguea server-side con prefijo; el template
jamás recibe `err.message`/stack. Si el propio render del 500 falla, hay
fallback en texto plano (anti-bucle). Trade-off documentado: los errores
JSON de `/api/*` mantienen `err.message` (contrato preexistente).

### §6.3 Validación de formulario de registro

**No es AJAX** (validación antes del submit). Archivo:
`public/js/register-validation.js`, importado en `pages/register.ejs`.

Reglas: `name`, `lastname`, `email`, `password` no vacíos (ni solo
espacios); sin espacios al principio/final; email con formato válido;
password mínimo 8 caracteres, al menos una letra, un número, un carácter
especial de `! @ # $ % ^ & * ( ) , . ? " : { } | < >`; no contiene cadenas
prohibidas (`"password"`, `"1234"`, `"qwerty"`, el nombre del sitio, el
nombre/email del formulario); no es igual al email. Mensajes de error
específicos por campo.

### §6.4 Carrito en sesión

**SÍ es AJAX.** El carrito se implementa con `fetch` hacia rutas bajo
`/api/cart/*`, que devuelven JSON con el carrito actualizado, y el
frontend (`public/js/cart.js`) reescribe solo los números afectados
(cantidad, subtotal, total, contador del header).

- La vista `/cart` usa `pages.controller.getCart` con `res.render` para la
  **carga inicial**.
- `express-session` se usa **únicamente** para el carrito, no para auth.
- El carrito vive en `req.session.cart` y solo contiene
  `{ productId: number, quantity: number }[]` — nunca el producto completo.
- `services/cart.service.ts` (`cartService`): `addItem`, `updateQuantity`,
  `removeItem`, `clear`, `getCartWithDetails` (combina sesión + datos reales
  de la DB; precios SIEMPRE recalculados).
- Rutas: `POST /api/cart/add/:productId`, `PATCH /api/cart/increase/:productId`,
  `PATCH /api/cart/decrease/:productId`, `DELETE /api/cart/remove/:productId`,
  `DELETE /api/cart/clear` (en `routes/api/cart.routes.ts`).
- `controllers/api/cart.controller.ts`: cada método llama al mismo
  `cartService` y responde JSON con el carrito recalculado.
- `public/js/cart.js` (defer, global desde `layout.ejs`): cada botón con
  `data-cart-action` manda su `fetch` y llama `updateCartUI(cart)`.
- Escenarios: ➕ suma 1, ➖ resta 1, en 0 elimina el ítem; "Vaciar carrito"
  reinicia a `[]`; carrito vacío → mensaje amigable + botón volver.

> **Persistencia:** la sesión se persiste en SQLite con
> `better-sqlite3-session-store` (PR #47) — ver §11. El carrito **sobrevive
> reinicios del servidor**. La cookie sigue sin `maxAge` (muere con el
> navegador), `httpOnly` y `sameSite: lax`; `saveUninitialized: false` para
> que la cookie nazca con la primera mutación del carrito.

### §6.5 Checkout temporal

**No es AJAX**, vista estática sin lógica. `pagesController.getCheckoutPlaceholder`
renderiza `pages/checkout` con mensaje "Checkout disponible en el próximo
sprint" y dos botones (volver a `/cart` y volver a `/`).

### §6.6 Home — "Te puede interesar"

**No es AJAX.** `productService.getSuggested(limit = 5)` devuelve los
primeros productos (lista completa, `slice(0, limit)`) con atributos
derivados resueltos. Se inyecta en `getHome` como `suggested` y se pinta
con `molecules/product.ejs`.

### §6.6b Home — Nav de categorías y banners promocionales

**Nav de categorías con ícono:** mismo `organisms/categories-nav.ejs` /
mismo dato (`categoryService.findAll()`). La tabla `categories` no tiene
columna de ícono; se resuelve con un mapeo estático en `src/utils/category-icons.ts`
(helper TS con íconos Lucide). Si el nombre no está en el mapeo, se usa el
ícono genérico de fallback `tag`.

**Banners promocionales (carrusel):** contenido de marketing no vinculado a
ninguna tabla. `services/promo.service.ts` (`promoService.getActiveBanners()`)
devuelve un array hardcodeado de banners (`title`, `subtitle`, `imageUrl`,
`linkUrl`). Se inyecta en `getHome` como `banners` y se pinta con
`organisms/product-hero.ejs`. Si un banner no tiene imagen real, el
`onerror` del template cae a `fallbackImageUrl` (ver §2.3).

### §6.7 Home — "Los más pedidos"

**No es AJAX.** `productService.getMostOrdered(limit = 10)` selecciona
productos al azar (`productRepository.listRandom(limit)`) con atributos
derivados. La tabla `products` no tiene `is_featured`; la selección
aleatoria es el fallback del spec (Fisher-Yates en `shuffle`, uniforme).

### §6.8 Detalle de producto `/products/:id`

**No es AJAX.** Ruta `GET /products/:id` → `pagesController.getProductDetail`:
`normalizeId(req.params.id)`; si `null` → 400; `productService.findById(id)`;
si no existe → 404; `productService.getRelated(product.id, categories)` →
renderiza `pages/product-detail` con `product` y `related`.

- `findById` devuelve `ProductView` completo (`imageUrl` con fallback §2.3,
  `inStock` §6.10, categorías N:M).
- **Productos relacionados** (hasta 4, comparten al menos una categoría,
  excluyendo el actual; aleatorios si hay más candidatos, Fisher-Yates).
- Se reutiliza `molecules/product.ejs` para listado y relacionados.
- El botón "Agregar al carrito" está deshabilitado si `!product.inStock`.
- **Punto de entrada:** las cards de `molecules/product.ejs` (imagen, nombre
  y precio, vía link extendido con `::after`) enlazan a esta ruta.

### §6.9 Normalización de IDs

**No es AJAX**, helper puro `src/utils/normalizeId.ts` y middleware
`src/middlewares/normalizeId.middleware.ts`:

```typescript
export function normalizeId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
```

- ID no numérico → 400 (middleware para `/api/*` con regex; helper para
  controllers de páginas).
- ID numérico pero inexistente en DB → 404 (resuelto en el controller,
  nunca en el validador).
- El fallback del middleware se limita a colecciones con id
  (`products|categories|orders`) — no parsea `DELETE /api/cart/clear`
  como `:id`.

### §6.10 Indicador "Sin stock"

**No es AJAX.** En `product.service.ts`, cada `ProductView` lleva
`inStock: product.stock > 0`. En `molecules/product.ejs` y
`pages/product-detail.ejs`, si `!product.inStock` → badge `.badge-out-of-stock`
+ botón deshabilitado (`.btn-disabled`). El backend también rechaza
`stock === 0` en el carrito (400 "Product out of stock", sesión intacta).

### §6.11 Total del carrito en el header

**Mixto:** en la mayoría de las páginas el contador se recalcula
server-side vía middleware `injectCartCount` (`res.locals.cartCount = sum(quantity)`),
montado en `app.ts` antes de las rutas. En `/cart`, el contador se
actualiza en el mismo `fetch` de §6.4 (el JSON incluye `count`).

### §6.12 Ordenar productos por precio

**No es AJAX** (server-rendered vía query string). `GET /products?sort=asc|desc`:
`productRepository.findAll(sort)` con `ORDER BY price ASC|DESC`;
`pagesController.getProducts` normaliza el sort y renderiza `pages/products`.

### §6.13 Buscador de productos

**No es AJAX** (server-rendered). `GET /search?query=`:
`productRepository.searchByName(query)` con `LIKE %query%`;
`pagesController.searchProducts` renderiza `pages/search-results` (mensaje
amigable si no hay resultados). El form de búsqueda es `method="GET"` hacia
`/search` en `molecules/search.ejs`. La query se escapa con `<%= %>` (XSS).

### §6.14 Layout base

`templates/layout.ejs` es el shell atómico (header + slot + footer) usado
por todas las páginas vía `express-ejs-layouts`
(`app.set("layout", "templates/layout")`). Incluye `organisms/header.ejs`
(con buscador y contador de carrito) y `organisms/footer.ejs`. El script
`cart.js` se carga globalmente con `defer` antes de `</body>`.

---

## §7. Checklist de pasos — histórico

> ⚠️ **Reemplazado (histórico).** El spec original definía un checklist de
> Pasos 1–14 para pedirle al orquestador. Todos los pasos del alcance
> (1–13) están **completos** y mergeados a `dev`. El detalle de ejecución
> está en `resultado-primer-sprint.md`. El Paso 14 (WebSockets) sigue
> pendiente — ver §8.

Resumen de pasos completados (ver `resultado-primer-sprint.md`):

| Paso | Alcance | PR |
|---|---|---|
| 0–1 | Saneamiento base + capa de datos + seed | #29 |
| 2 | Cloudinary (integrado y luego eliminado, ver §2) | #30 → #71 |
| 3 | Nav de categorías + íconos | #30 |
| 4 | Componentes de producto | #31 |
| 5 | Home completo | #32 |
| 6 | Carrito completo (backend + vista + AJAX) | #33 |
| 7 | Contador de carrito | #34 |
| 8 | Detalle de producto + breadcrumb + relacionados | #34 |
| 9 | Login/Register + validación | #35 |
| 10 | Páginas 404/500 | #36 |
| 11 | Categoría + Checkout placeholder | #37 |
| 12 | Ordenar y buscar + carrito global | #38 |
| 13 | Componentes opcionales (menús + dialog) | #39 |

---

## §8. Fase futura (NO implementar ahora): tiempo real con WebSockets

**No forma parte del alcance actual.** Se documenta para que quede
registrado el alcance; depende de que el carrito en sesión (§6.4) ya esté
terminado y estable.

Requisitos de alto nivel (para cuando se aborde):

- Servidor WebSocket (`ws`) montado sobre el mismo servidor HTTP de Express.
- Servicio centralizado (`services/socket.service.ts`) que registre/elimine
  conexiones, haga broadcast y serialice mensajes con formato fijo
  `{ type: string, payload: object }` (ej. `{ type: "cartUpdated", payload: { items: 4, total: 8500 } }`).
- Los controllers **nunca** tocan el WebSocket directamente.
- Cliente: reconexión automática, indicador visual "Conectado"/"Desconectado".
- Complementa (no reemplaza) las rutas AJAX de `/api/cart/*`.

---

## §9. Checklist de validación general

- [ ] Nada usa JSON como fuente de datos — todo pasa por SQLite.
- [ ] Ningún controller contiene queries SQL ni lógica de negocio.
- [ ] `req.session.cart` solo contiene `{ productId, quantity }`, nunca el
      producto completo ni datos sensibles.
- [ ] Las rutas marcadas "No es AJAX" no usan `fetch`. La única excepción
      es el carrito (§6.4).
- [ ] El nombre de cada `.ejs` coincide con el de la tabla §3/§4.
- [ ] Las variables EJS usadas coinciden con las que pasa el controller.
- [ ] Los atributos `data-*` de §5 están presentes y sin renombrar.
- [ ] Un componente que se repite en 2+ lugares se genera **una sola vez**
      y se reutiliza con `include`.
- [ ] Antes de crear un archivo nuevo en `atoms/` o `molecules/`, confirmar
      que se reutiliza en 2+ lugares.
- [ ] Mobile-first con Tailwind.
- [ ] 404 y 500 no filtran información técnica al usuario final.
- [ ] Todo ID recibido por URL pasa por `normalizeId` antes de llegar al
      repository.
- [ ] `npx tsc --noEmit` pasa sin errores antes de mergear.

---

## §10. Swagger / OpenAPI en `/api-docs`

> **Sección nueva** (no existía en el spec original; PR #58).

- Dependencias: `swagger-jsdoc` (`^6.2.8`) y `swagger-ui-express` (`^5.0.1`).
- `src/config/swagger.ts` — definición OpenAPI 3.0 con schemas `Cart` y
  `Product`, paths a escanear: `src/routes/api/*.routes.ts`,
  `src/controllers/api/*.controller.ts`,
  `src/controllers/pages/pages.controller.ts`.
- `src/routes/docs.routes.ts` — router que sirve Swagger UI en `/api-docs`.
- `src/app.ts` monta `docsRouter` en `/api-docs` antes del catch-all 404.
- Bloques `@swagger` con annotations en los handlers:
  - `src/controllers/api/cart.controller.ts` — 5 endpoints (`addItem`,
    `increaseItem`, `decreaseItem`, `removeItem`, `clearCart`).
  - `src/controllers/pages/pages.controller.ts` — 7 endpoints (`getHome`,
    `getCart`, `getProductDetail`, `getCategory`, `getProducts`,
    `searchProducts`, `getCheckout`).

**Nota:** swagger-jsdoc lee los bloques `@swagger` de los archivos listados
en `apis`; los `@param` de TypeScript normales **no** son leídos por
swagger-jsdoc. No mezclar ambos en el mismo bloque.

---

## §11. Persistencia de sesión en SQLite

> **Sección nueva** (no existía en el spec original; PR #47).

- Dependencia: `better-sqlite3-session-store` (`^0.1.0`).
- En `src/app.ts` se configura `SqliteStore` con el cliente `db`:

```typescript
const SqliteStore = SqliteStoreFactory(session);
// ...
store: new SqliteStore({
  client: db,
  expired: {
    clear: true,
    intervalMs: 900000, // limpia sesiones vencidas cada 15 min
  },
}),
```

- El carrito (y la sesión en general) ahora **persiste en `dev.db`** y
  sobrevive reinicios del servidor (antes vivía solo en memoria).
- La cookie sigue sin `maxAge`, `httpOnly: true`, `sameSite: "lax"`;
  `saveUninitialized: false`.

---

## §12. Script de seed idempotente

> **Sección nueva** (no existía en el spec original; PR #29).

- `scripts/seed.ts`, ejecutable con `npm run seed`.
- Inserta 3 categorías (Periféricos, Monitores, Audio) y 4 productos
  (Teclado Mecánico, Mouse Gamer, Monitor 24", Headset) con
  `INSERT OR IGNORE` + índices UNIQUE (`idx_products_name`,
  `idx_categories_name`).
- Crea los joins N:M en `product_categories`.
- **Re-ejecutable sin duplicar filas.**
- **No se ejecuta automáticamente** al correr `npm run dev`; el usuario lo
  corre manualmente después de que el esquema exista.
- Todos los productos del seed tienen `image_url: null` → caen al fallback
  configurable (§2.3).

---

## §13. `.gitattributes` normalización EOL

> **Sección nueva** (no existía en el spec original; PR #56).

`.gitattributes` fuerza normalización de fin de línea a **LF**:

```
* text=auto
*.ts text eol=lf
*.js text eol=lf
*.md text eol=lf
*.json text eol=lf
*.css text eol=lf
*.ejs text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.env text eol=lf
*.example text eol=lf
```

---

## §14. Estructura de directorios actual

> **Sección nueva** — basada en `find src -type f`, no en documentos viejos.

```
src/
├── app.ts                          ← punto de entrada, Express setup
├── styles.css                      ← estilos Tailwind (clases .btn-*, .badge, etc.)
├── config/
│   ├── database.ts                 ← SQLite bootstrap + pragmas
│   ├── env.ts                      ← configuración tipada de env vars (PORT, SESSION_SECRET, FALLBACK_IMAGE_URL)
│   └── swagger.ts                  ← especificación OpenAPI (ver §10)
├── controllers/
│   ├── api/
│   │   └── cart.controller.ts      ← endpoints AJAX del carrito
│   └── pages/
│       └── pages.controller.ts     ← handlers de páginas SSR
├── middlewares/
│   ├── error-handler.middleware.ts
│   ├── injectCartCount.middleware.ts
│   └── normalizeId.middleware.ts
├── repositories/
│   ├── product.repository.ts
│   └── category.repository.ts
├── services/
│   ├── product.service.ts
│   ├── category.service.ts
│   ├── cart.service.ts
│   └── promo.service.ts
├── routes/
│   ├── index.routes.ts             ← router API principal
│   ├── pages.routes.ts             ← router de páginas SSR
│   ├── docs.routes.ts              ← Swagger UI (/api-docs)
│   └── api/
│       ├── auth.routes.ts          ← definido, sin backend real
│       ├── cart.routes.ts
│       ├── categories.routes.ts
│       ├── orders.routes.ts        ← definido, sin backend real
│       └── products.routes.ts
├── models/                         ← interfaces de datos (user, product, category, cart, order, orderItem, productCategory)
├── dtos/                           ← Data Transfer Objects (product.dto, cart.dto)
├── utils/
│   ├── category-icons.ts           ← mapeo categoría → ícono Lucide
│   └── normalizeId.ts              ← helper puro de validación de IDs
├── types/
│   └── better-sqlite3-session-store.d.ts  ← declaración de tipos
└── views/templates/                ← árbol atómico (ver §15)
```

Notas:
- `auth.routes.ts` y `orders.routes.ts` existen como scaffolds pero **no
  tienen backend real** (sin login ni checkout funcional).
- `src/services/cart.service.ts`, `product.service.ts`, `category.service.ts`
  y `promo.service.ts` son los únicos services con contenido real.

---

## §15. Árbol atómico de views y view root único

> **Sección nueva** (PR #51 consolidó el árbol; ver `reestructuracion-views.md`).

Estructura final de vistas (36 archivos EJS):

```
src/views/
└── templates/
    ├── layout.ejs                     ← shell: header + slot + footer
    ├── atoms/                         ← badge-counter, input, menu-item, profile-pic
    ├── molecules/                     ← breadcrumb, cart-icon, header-right, numeric,
    │                                    product, product-row, profile-btn, search
    ├── organisms/                     ← cart-item, categories-dropdown, categories-nav,
    │                                    dialog, footer, footer-mobile, header, header-mobile,
    │                                    menu-desktop, menu-mobile, product-grid, product-hero
    └── pages/                         ← 404, 500, cart, category, checkout, index,
                                         login, product-detail, products, register,
                                         search-results
```

**View root único** en `src/app.ts`:

```typescript
app.set("views", path.join(__dirname, "views"));
```

Resolución de rutas en Express:
- `res.render("templates/pages/404", {...})` → `src/views/templates/pages/404.ejs` (dev)
- `res.render("templates/pages/404", {...})` → `dist/views/templates/pages/404.ejs` (prod)

No existen vistas legacy en raíz (`views/`) ni en `src/views/pages/` —
fueron eliminadas en el PR #51.

---

## §16. Variables de entorno

> **Sección nueva.** Coherentes con `.env.example`; leídas por
> `src/config/env.ts` (y `process.env.PORT` en `app.ts`).

| Variable | Uso | Default en código | Validación |
|---|---|---|---|
| `PORT` | Puerto del servidor Express | `3000` | numérico; si falta/inválido usa default |
| `SESSION_SECRET` | Secreto de `express-session` | `""` | texto; usar un valor aleatorio largo en producción |
| `FALLBACK_IMAGE_URL` | Imagen fallback de productos | `https://placehold.co/600x600?text=Sin+imagen` | URL `http(s)://...` o ruta que empiece con `/`; si falta/inválida → warning + default |

`.env.example`:

```bash
PORT=3000
SESSION_SECRET=cambiar_por_un_secreto_largo_y_aleatorio
# URL de la imagen que se muestra cuando un producto no tiene image_url.
# Acepta http(s)://... o una ruta que empiece con "/". Si falta o es inválida, se usa el default.
FALLBACK_IMAGE_URL=https://placehold.co/600x600?text=Sin+imagen
```

`dev.db`, `dist/`, `node_modules/`, `.env`, `*.log`, `.DS_Store` están en
`.gitignore`. (Pendiente conocido: `dev.db-shm` y `dev.db-wal` no están en
`.gitignore`.)

---

## §17. Documentación generada (`docs/`)

> **Sección nueva** (PR #64; sincronizada en PR #73).

- `docs/` es una carpeta **versionada** en git con documentación HTML
  generada por **TypeDoc** a partir de los comentarios JSDoc del código.
- Script: `npm run build:docs` = `typedoc --options scripts/typedoc.json && npm run graph:deps`.
  - Typedoc genera el HTML en `docs/`.
  - `graph:deps` (madge) genera `docs/graphs/dependencias.svg` (requiere
    Graphviz instalado).
- `scripts/typedoc.json` define la config (entry `src`, out `docs`,
  `skipErrorChecking: true`).
- **Regla:** si cambia la arquitectura o los comentarios JSDoc del código,
  regenerar y commitear `docs/`.

---

## §18. Convención de comentarios JSDoc

> **Sección nueva** (PR #56).

Todos los archivos TypeScript usan JSDoc con:

- `@fileoverview` (o comentario de módulo arriba) para la descripción del
  archivo.
- `@param {Tipo} nombre - descripción` y `@returns {Tipo} descripción` en
  cada función.
- Referencias al spec con formato `(spec §X.Y)` — **apuntan a este
  documento** (`SPEC.md`), no a los históricos.
- Los bloques `@swagger` (OpenAPI) van separados de los `@param`
  (swagger-jsdoc no lee los `@param`, ver §10).
- Los comentarios en `.ejs` son sintaxis JS dentro de `<% %>`; no son JSDoc
  real y no los parsea ninguna herramienta.

---

## Tabla de equivalencias — `§` original → `SPEC.md`

| `§` original (spec sprint 1) | `§` en `SPEC.md` | Estado |
|---|---|---|
| §0 Contexto del proyecto | §0 | Vigente (árbol actualizado) |
| §1 Base de datos | §1 | Vigente |
| §1.1 Esquema | §1.1 | Vigente |
| §1.2 Categorías N:M | §1.2 | Vigente |
| §1.3 Atributos derivados | §1.3 | Vigente |
| §1.4 Migración de datos | §1.4 | Reemplazado (→ seed, §12) |
| §2 Integración con Cloudinary | §2 Imágenes — fallback configurable | Reemplazado (PR #71) |
| §2.1 Config | §2.1 | Reemplazado (PR #71) |
| §2.2 Escenarios de uso | §2.2 | Reemplazado (PR #71) |
| §2.3 Helper de fallback | §2.3 | Reemplazado (PR #71) |
| §3 Sistema de diseño | §3 | Vigente |
| §4 Mapeo de páginas | §4 | Vigente |
| §4.1–§4.6 | §4.1–§4.6 | Vigente |
| §5 Contrato `data-*` | §5 | Vigente |
| §6 Funcionalidades | §6 | Vigente |
| §6.1–§6.14 | §6.1–§6.14 | Vigente (con notas de persistencia §11) |
| §7 Checklist de pasos | §7 | Histórico (completado) |
| §8 Fase futura WebSockets | §8 | Vigente (futuro, no implementado) |
| §9 Checklist de validación | §9 | Vigente |
| — (nuevo) | §10 Swagger / OpenAPI | Nuevo |
| — (nuevo) | §11 Persistencia de sesión SQLite | Nuevo |
| — (nuevo) | §12 Seed idempotente | Nuevo |
| — (nuevo) | §13 `.gitattributes` EOL | Nuevo |
| — (nuevo) | §14 Estructura de directorios | Nuevo |
| — (nuevo) | §15 Árbol atómico de views | Nuevo |
| — (nuevo) | §16 Variables de entorno | Nuevo |
| — (nuevo) | §17 Documentación generada `docs/` | Nuevo |
| — (nuevo) | §18 Convención JSDoc | Nuevo |

---

## Historial de cambios

| Fecha | PR / Issue | Resumen | Detalle histórico |
|---|---|---|---|
| 2026-09-08 | PR #29 | Base del proyecto: saneamiento, capa de datos (6 tablas N:M), seed inicial, imagen fallback | `resultado-primer-sprint.md` |
| 2026-09-08 | PRs #30–#39 | Pasos 2–13 del sprint: Cloudinary, componentes, Home, carrito, detalle, auth vistas, 404/500, categoría/checkout, orden/búsqueda, componentes opcionales | `resultado-primer-sprint.md` |
| 2026-09-14 | PR #47 | Persistencia de sesión en SQLite (`better-sqlite3-session-store`); el carrito sobrevive reinicios | `cambios-no-registrados.md` §2 |
| 2026-09-17 | PR #51 | Reestructuración de views: raíz única `src/views/templates`, legacy eliminado | `reestructuracion-views.md` |
| 2026-09-27 | PR #56 | JSDoc en todo el código TypeScript + `.gitattributes` EOL | `cambios-no-registrados.md` §3–§4 |
| 2026-09-28 | PR #58 | Configuración Swagger completa en `/api-docs` | `cambios-no-registrados.md` §1 |
| 2026-09-28 | PR #64 | Carpeta `docs/` con documentación TypeDoc versionada | `documentacion-typedoc.md` |
| 2026-09-29 | PR #67 | Documentación de cambios no registrados en `spectsEccomerce` | `documentacion-typedoc.md`, `cambios-no-registrados.md` |
| 2026-10-03 | PR #71 / issue #70 | Eliminación de Cloudinary; `FALLBACK_IMAGE_URL` configurable; `onerror` en `<img>` | `cambios-no-registrados.md` §6 |
| 2026-10-03 | PR #73 / issue #72 | Sincronización de `.env.example`, README, JSDoc y `docs/` | `cambios-no-registrados.md`, `README.md` |
| 2026-10-03 | Este PR | Creación de la SPEC viva; históricos marcados | — |
| 2026-10-07 | Este PR / issue #77 | Card de producto clickeable a /products/:id (link extendido) | — |

---

## Cómo mantener este documento

1. **Al cambiar algo en el código:** editar la sección correspondiente de
   este documento (nunca renumerar).
2. **Registrar el cambio:** agregar una fila en la tabla de historial con
   fecha, PR/issue y un resumen de una línea.
3. **Crear un `.md` histórico solo si el cambio lo amerita** (decisión
   grande o contexto valioso); de lo contrario, la fila del historial basta.
4. **Las secciones reemplazadas** conservan su número y encabezado, se
   marcan con `> ⚠️ Reemplazado:` y apuntan al histórico que lo documenta.
5. **Las funcionalidades nuevas** se agregan al final con la numeración
   siguiente (`§19`, `§20`, …).
6. **Los comentarios del código citan `(spec §X.Y)`** apuntando a este
   archivo; si una referencia queda obsoleta, actualizar el comentario y
   este documento a la vez.
7. **Regenerar `docs/`** (`npm run build:docs`) cuando cambien los
   comentarios JSDoc, y commitear el resultado.