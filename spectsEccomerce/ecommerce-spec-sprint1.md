# Especificación técnica única — MiEcommerce (fase de expansión)

> Documento único para entregarle a la IA de desarrollo (opencode /
> orquestador, modelo Ling 3.0 Flash) como contrato de trabajo. Antes esto
> estaba dividido en un spec funcional (backend) y un spec de UX (vistas) —
> se fusionaron en uno solo porque un único modelo va a implementar ambas
> partes, y tenerlas separadas solo obligaba a cruzar referencias entre
> archivos sin necesidad real.
>
> Describe **solo funcionalidades nuevas** respecto a lo ya implementado en
> el proyecto. No incluye la estructura de los sprints originales — fue
> reemplazada por la arquitectura en capas + sistema de diseño ya adoptados.

---

## 0. Contexto del proyecto (no tocar)

El proyecto es un monolito **TypeScript + Express + EJS**, con arquitectura
en capas para el backend y **Atomic Design** para las vistas — ambas
conviven en el mismo árbol:

```
src/
├── app.ts
├── config/
│   ├── database.ts
│   ├── env.ts
│   └── cloudinary.ts
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
│   └── api/
└── views/
    ├── templates/
    │   └── layout.ejs           ← header + slot de contenido + footer
    ├── atoms/                   ← piezas sin datos propios, sin lógica
    ├── molecules/                ← combinación de 2+ átomos, reutilizable
    ├── organisms/                ← bloque completo, con datos reales
    └── pages/                    ← una vista por ruta

specsEcommerce/                   ← NO es parte de src/, es material de referencia
├── ecommerce-spec-completa.md    ← este documento
├── layouts/                      ← mockups de componentes (design system exportado)
└── pages/                        ← mockups de páginas completas
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
  (hoy SQLite vía `better-sqlite3`, antes hardcode).
- **Model** → solo forma de los datos (interfaces).
- **DTO** → forma de los datos que entra/sale por un endpoint específico.
- **Atom/Molecule** → sin datos reales, reciben todo por props/variables EJS.
- **Organism** → puede tener datos reales inyectados por el controller.
- `routes/api/*` **solo** existe para funcionalidades que necesitan
  actualizar la pantalla sin recargar (AJAX real). Todo lo demás usa
  `res.render` / `res.redirect` desde `controllers/pages`.
- No usar Swagger ni documentar contrato REST público — no hay consumidor
  externo de la API.

---

## 1. Base de datos — esquema actual y correcciones necesarias

### 1.1 Esquema (ya definido, se documenta para contexto)

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

`users` y `orders`/`order_items` se crean ya en esta etapa pero **no se
implementa login ni checkout real todavía** — son tablas preparadas para más
adelante. No hay que construir auth ni checkout en este alcance.

### 1.2 Corrección de arquitectura obligatoria: categorías es N:M

Cualquier repositorio o servicio de productos escrito antes asumiendo
`products.category_id` queda **obsoleto**. Ajustar:

```typescript
// repositories/product.repository.ts
async findByCategory(categoryId: number): Promise<Product[]> {
  return db.prepare(`
    SELECT p.* FROM products p
    JOIN product_categories pc ON pc.product_id = p.id
    WHERE pc.category_id = ?
  `).all(categoryId) as Product[];
}

async findCategoriesByProduct(productId: number): Promise<Category[]> {
  return db.prepare(`
    SELECT c.* FROM categories c
    JOIN product_categories pc ON pc.category_id = c.id
    WHERE pc.product_id = ?
  `).all(productId) as Category[];
}
```

### 1.3 Atributos derivados que faltan (calcular en Service, no en la vista)

| Atributo derivado | Origen | Dónde calcularlo |
|---|---|---|
| `inStock` (boolean) | `stock > 0` | `product.service.ts`, al armar el objeto que va a la vista |
| `categories` (array de nombres) | JOIN `product_categories` | `product.service.ts` (usa `findCategoriesByProduct`) |
| `subtotal` de un ítem de carrito | `quantity * unit_price` real (no confiar en lo que mande el cliente) | `cart.service.ts` |
| `total` del carrito | suma de subtotales | `cart.service.ts` |
| `total` de una orden | suma de `order_items.quantity * order_items.unit_price` | `order.service.ts` (futuro) |
| `imageUrl` con fallback | si `image_url` es null/vacío, usar imagen por defecto | `product.service.ts` (ver sección Cloudinary) |

### 1.4 Migración de datos (si aún hay JSON de productos)

Crear `scripts/migrate.ts` (fuera de `src/`, es un script one-off):

- Lee el JSON viejo de productos (si existe).
- Inserta en `products` y en `product_categories` según corresponda.
- Usa `INSERT OR IGNORE` para que correr el script dos veces no duplique.
- Una vez migrado, **eliminar el JSON y cualquier referencia** en repositorios
  (ya no debe quedar código con fallback a JSON).

---

## 2. Integración con Cloudinary (para `products.image_url`)

> **Reemplazado**: Cloudinary fue eliminado. El fallback de imagen ahora se
> configura con `FALLBACK_IMAGE_URL` en `.env`. Ver `plan-eliminar-cloudinary.md`.

`image_url` en la tabla ya está pensado para guardar la URL segura que
devuelve Cloudinary, no un path local.

### 2.1 Config

```typescript
// config/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
```

Variables de entorno a agregar en `config/env.ts` y `.env.example`:
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

### 2.2 Dos escenarios de uso (aclarar cuál aplica hoy)

- **Solo lectura (aplica ahora):** los productos ya tienen su `image_url`
  cargada en la DB apuntando a Cloudinary (por seed o migración manual). Las
  vistas y el `molecules/product.ejs` simplemente usan esa URL. Si viene null o
  vacía, se usa una imagen de fallback fija (subida una sola vez a Cloudinary
  o servida como estática en `/public`).
- **Carga real de imágenes (fase futura, NO implementar todavía):** un form
  de alta/edición de producto que suba el archivo a Cloudinary
  (`cloudinary.uploader.upload(...)`) y guarde el `secure_url` devuelto en
  `products.image_url`. Esto requiere un CRUD de productos que hoy no existe
  — dejar solo la config lista, no construir el CRUD.

### 2.3 Helper de fallback

```typescript
// services/product.service.ts
const FALLBACK_IMAGE_URL = "https://res.cloudinary.com/<cloud_name>/image/upload/v1/ecommerce/fallback.png";

function withImageFallback(product: Product): Product {
  return {
    ...product,
    image_url: product.image_url?.trim() ? product.image_url : FALLBACK_IMAGE_URL,
  };
}
```

Aplicar este helper en **todo** lugar donde se devuelvan productos a una
vista (home, listado, detalle, relacionados, sugeridos).

---

## 3. Sistema de diseño — mapeo de componentes

Los mockups de componentes están en `specsEcommerce/layouts/` (imágenes
exportadas de Figma con nombre propio). La tabla mapea cada uno a su
partial `.ejs`, su clasificación Atomic Design y dónde se usa. El nombre
del archivo `.ejs` siempre deriva del nombre del asset (kebab-case) — no
inventar nombres nuevos.

| Archivo en `layouts/` | Qué es | Partial (`views/...`) | Tipo | Usado en |
|---|---|---|---|---|
| `ProfilePic.png` | Círculo de foto de usuario, sin nombre | `atoms/profile-pic.ejs` | atom | dentro de `profile-btn.ejs`, `menu-desktop.ejs`, `menu-mobile.ejs` |
| `Cart/Badge.svg` | Círculo rojo numérico | `atoms/badge-counter.ejs` | atom | dentro de `cart-icon.ejs` — mapea a `data-cart-count` |
| `Input.png` | Input de texto, variantes claro/oscuro | `atoms/input.ejs` | atom | Login, Register |
| `MenuItem.png` | Un ítem de menú suelto (ej. "Inicio") | `atoms/menu-item.ejs` | atom | dentro de `menu-desktop.ejs`/`menu-mobile.ejs` |
| `Button.png` | Variantes de botón: primario, secundario, disabled | clases Tailwind (`.btn-primary`/`.btn-secondary`/`.btn-disabled` en `styles.css`), no amerita partial propio | atom | en todos lados |
| `H1.png`/`H2.png`/`H3.png` | Guía tipográfica (no llevan datos) | clases Tailwind de texto definidas una vez, sin partial | atom (guía visual) | referencia de estilo |
| `Search.svg` | Input de búsqueda + ícono de lupa | `molecules/search.ejs` | molecule | `header.ejs`, `header-mobile.ejs` |
| `ProfileBtn.png` | `atoms/profile-pic.ejs` + nombre ("Olivia") | `molecules/profile-btn.ejs` | molecule | dentro de `header-right.ejs` |
| `Cart.png` | Ícono de carrito + `atoms/badge-counter.ejs` | `molecules/cart-icon.ejs` | molecule | dentro de `header-right.ejs` |
| `Header-Right.png` | `molecules/cart-icon.ejs` + `molecules/profile-btn.ejs` | `molecules/header-right.ejs` | molecule | dentro de `organisms/header.ejs` |
| `Numeric.png` | Control de cantidad `- N +` | `molecules/numeric.ejs` | molecule | dentro de `organisms/cart-item.ejs` — botones mapean a `data-cart-action` |
| `BreadCrumb.png` | "← Volver al Listado > Category" | `molecules/breadcrumb.ejs` | molecule | Categoría, Detalle de producto |
| `ProductRow.png` | Producto en fila horizontal compacta (imagen chica + nombre + id + `>`) | `molecules/product-row.ejs` | molecule | sin página asignada todavía — ver nota abajo |
| `Product.png` | Card de producto (imagen + nombre + precio + botón) | `molecules/product.ejs` | molecule | dentro de `organisms/product-grid.ejs` |
| `Header.png` | `molecules/search.ejs` + `molecules/header-right.ejs` + logo | `organisms/header.ejs` | organism | todas las páginas |
| `HeaderMobile.png` | Header mobile compacto (2 estados: con/sin fondo al scrollear) | `organisms/header-mobile.ejs` | organism | todas las páginas, breakpoint mobile |
| `Footer.png` | Footer desktop | `organisms/footer.ejs` | organism | todas las páginas |
| `FooterMobile.png` | Footer mobile (mismo contenido, vertical) | `organisms/footer-mobile.ejs` | organism | todas las páginas, breakpoint mobile |
| `Categories.png` | Barra horizontal de categorías con ícono | `organisms/categories-nav.ejs` | organism | Home (x2), filtro de listado |
| `Categories-1.png` | Lista vertical de categorías, fondo oscuro (variante dropdown) | `organisms/categories-dropdown.ejs` | organism | menú mobile / filtro lateral — sin página asignada todavía |
| `ProductHero.png` | Banner grande con imagen de fondo + overlay + texto de promo | `organisms/product-hero.ejs` | organism | carrusel de Home (mapea a `banners`, sección 6.6b) |
| (envuelve N `molecules/product.ejs`) | Grilla de productos con título | `organisms/product-grid.ejs` | organism | "Te puede interesar", "Los más pedidos", Categoría, Relacionados — **un solo componente, cuatro usos distintos** |
| `CartItem.png` | Fila completa del carrito: imagen, nombre, "Quitar", `molecules/numeric.ejs`, precio | `organisms/cart-item.ejs` | organism | página `/cart` — raíz con `data-cart-item="<productId>"` |
| `Dialog.png` | Modal genérico: título, cuerpo, botón secundario + primario | `organisms/dialog.ejs` | organism | sin uso en el alcance actual — queda listo para futuro (ej. confirmar "vaciar carrito") |
| `MenuDesktop.png` | Dropdown de usuario: avatar+nombre + lista de `atoms/menu-item.ejs` | `organisms/menu-desktop.ejs` | organism | se abre desde `ProfileBtn` — bonus/futuro |
| `MenuMobile.png` | Igual, versión fullscreen/mobile | `organisms/menu-mobile.ejs` | organism | análogo mobile |

**Componentes sin página asignada todavía** (`ProductRow`,
`Categories-1`/dropdown, `Dialog`, `MenuDesktop`/`MenuMobile`/`MenuItem`):
generarlos igual como partials reutilizables (así queda el sistema de
diseño completo), pero no bloquean ningún paso del checklist de la
sección 7 — sus funciones (Historial, Mis Compras, Favoritos, confirmar
vaciar carrito) no están en el alcance funcional actual.

---

## 4. Mapeo de páginas (`specsEcommerce/pages/*.page.png` → vista)

### 4.1 Home (`home1.page.png` + `home2.page.png`)

Una sola vista `pages/index.ejs`, partida en dos capturas porque la página
es más larga que el viewport. Orden real, de arriba hacia abajo:

| # | Bloque | Organism | Dato (`pages.controller.getHome`) |
|---|---|---|---|
| 1 | Header | `organisms/header.ejs` | `cartCount`, sesión de usuario (bonus) |
| 2 | Nav de categorías (arriba) | `organisms/categories-nav.ejs` | `categories` |
| 3 | Carrusel de banners promocionales | `organisms/product-hero.ejs` × 2+ | `banners` (`promoService.getActiveBanners()`, sección 6.6b) |
| 4 | "Te puede interesar" | `organisms/product-grid.ejs` | `suggested` (sección 6.6) |
| 5 | "Los más pedidos" | mismo `organisms/product-grid.ejs`, más ítems | `mostOrdered` (sección 6.7) |
| 6 | Nav de categorías (abajo) | misma instancia de `organisms/categories-nav.ejs`, `include` repetido | `categories` (mismo dato) |
| 7 | Footer | `organisms/footer.ejs` | estático |

### 4.2 Carrito (`cart.page.png`)

| Bloque | Organism | Dato / atributo |
|---|---|---|
| Header | `organisms/header.ejs` | `cartCount` |
| Link "Volver" | — | `<a href="/">← Volver</a>` |
| Lista de ítems | `organisms/cart-item.ejs` × N | `items` — cada fila `data-cart-item="<productId>"` |
| Total | — | `total` → `data-cart-total` |
| Botón "Ir a Pagar" | clase `.btn-primary` | link normal a `/checkout`, no AJAX |
| Footer | `organisms/footer.ejs` | estático |

Si `items` está vacío: bloque `data-cart-empty` (oculto por defecto, el
`cart.js` lo muestra) con mensaje amigable + botón volver al inicio.

### 4.3 Detalle de producto (`product.page.png`)

| Bloque | Organism | Dato |
|---|---|---|
| Header | `organisms/header.ejs` | `cartCount` |
| Breadcrumb | `molecules/breadcrumb.ejs` | nombre de categoría + nombre de producto |
| Info principal | imagen grande + nombre + precio + descripción + categorías | `product` (sección 6.8) |
| Badge "Sin stock" | mismo estilo que use `molecules/product.ejs` si aplica | `!product.inStock` (sección 6.10) |
| Botón "Agregar al carrito" | clase `.btn-primary`, disabled si sin stock | `data-cart-action="add"` `data-product-id` |
| Productos relacionados | `organisms/product-grid.ejs` | `related` (hasta 4, sección 6.8) |
| Footer | `organisms/footer.ejs` | estático |

> Revisar el mockup real de `product.page.png` para confirmar el orden
> exacto de estos bloques — esta tabla es la mejor inferencia posible sin
> haber visto el archivo directamente, basada en la sección 6.8.

### 4.4 Login (`login.page.png`)

Banda superior color teal a todo el ancho, tarjeta blanca centrada:
título "¡Hola!", `atoms/input.ejs` × 2 (usuario/contraseña), botón
primario "Iniciar Sesión", link "¿No tienes cuenta? Regístrate" → `/register`.

**Desajuste a resolver (dato, no diseño):** el input dice "Tu nombre de
usuario" pero la tabla `users` del schema solo tiene `email`, no
`username`. Mientras no se decida agregar esa columna, el input debe ser
`type="email" name="email"` por dentro — el texto visible puede seguir
diciendo "usuario", es cosmético.

### 4.5 Register (`register.page.png`)

Mismo lenguaje visual que Login (banda teal + tarjeta centrada). Los
`name`/`id` de los inputs tienen que ser exactamente `name`, `lastname`,
`email`, `password` porque `register-validation.js` (sección 6.3) los
referencia por esos nombres — revisar el mockup real y ajustar si trae
campos adicionales (ej. confirmar contraseña) antes de generar el HTML.

### 4.6 Páginas sin mockup todavía

- **Categoría** (`/categories/:category`): `organisms/product-grid.ejs`
  (mismo que "Te puede interesar"), con `molecules/breadcrumb.ejs` arriba
  y título del nombre de categoría. Mensaje amigable si no hay productos.
- **Checkout** (`/checkout`): vista simple centrada, mensaje "Checkout
  disponible en el próximo sprint" + dos botones (volver al carrito /
  volver al inicio).
- **404 / 500**: página centrada, mensaje corto, botón volver al inicio.
  Estilo consistente con el resto, sin mockup propio todavía.

---

## 5. Contrato de atributos `data-*` (fijo, no negociable)

Todo elemento interactivo necesita estos atributos exactos para que
`cart.js` (sección 6.4) pueda encontrarlo y actualizar el DOM sin recargar
la página. Se generan **junto con** el HTML del componente, en el mismo
paso — no es una capa aparte que se agrega después:

| Componente | Atributo | Dónde va | Usado por |
|---|---|---|---|
| Card de producto | `data-product-id="<id>"` | contenedor raíz de `molecules/product.ejs` | futuros JS de detalle/relacionados |
| Botón agregar al carrito | `data-cart-action="add"` `data-product-id="<id>"` | `<button>` dentro de `molecules/product.ejs` | `cart.js` |
| Fila de ítem en `/cart` | `data-cart-item="<productId>"` | contenedor raíz de cada `organisms/cart-item.ejs`, dentro de `pages/cart.ejs` | `cart.js` (`updateCartUI`) |
| Cantidad del ítem | `data-quantity` | `<span>` dentro de `molecules/numeric.ejs` | `cart.js` |
| Subtotal del ítem | `data-subtotal` | `<span>` dentro de `organisms/cart-item.ejs` | `cart.js` |
| Botón `+` | `data-cart-action="increase"` `data-product-id="<id>"` | `<button>` dentro de `molecules/numeric.ejs` | `cart.js` |
| Botón `-` | `data-cart-action="decrease"` `data-product-id="<id>"` | `<button>` dentro de `molecules/numeric.ejs` | `cart.js` |
| Botón "Quitar" | `data-cart-action="remove"` `data-product-id="<id>"` | `<button>` dentro de `organisms/cart-item.ejs` | `cart.js` |
| Botón "Vaciar carrito" | `data-cart-action="clear"` | `<button>` fuera del loop de filas, en `pages/cart.ejs` | `cart.js` |
| Total del carrito | `data-cart-total` | `<span>` del total en `pages/cart.ejs` | `cart.js` |
| Contador del header | `data-cart-count` | dentro de `atoms/badge-counter.ejs`, incluido en `molecules/cart-icon.ejs` → `molecules/header-right.ejs` → `organisms/header.ejs` | `cart.js` (y el middleware `injectCartCount` en el resto del sitio) |
| Mensaje de carrito vacío | `data-cart-empty` (con clase `hidden` por defecto) | bloque de mensaje en `pages/cart.ejs` | `cart.js` |

Cualquier `id`/`class` adicional por estética (Tailwind, animaciones, etc.)
es libre — estos `data-*` son aditivos, no reemplazan el resto del markup.

## 6. Funcionalidades nuevas a implementar

Cada una sigue el patrón: Route → Controller (`pages` o `api` según
corresponda) → Service → Repository → View. Se indica explícitamente si es
AJAX o no.

### 6.1 Página 404

**No es AJAX.** Middleware de Express, no ruta.

- Crear `views/pages/404.ejs` (puede extender `layout.ejs`).
- En `app.ts`, **después** de montar todas las rutas, agregar un middleware
  catch-all que responda `res.status(404).render("pages/404")`.
- Bonus (opcional): sugerir volver al inicio o al listado de productos.

```typescript
// app.ts (al final, después de app.use("/", routes))
app.use((req, res) => {
  res.status(404).render("pages/404", { title: "Página no encontrada" });
});
```

### 6.2 Página 500

**No es AJAX.**

- Crear `views/pages/500.ejs`.
- Crear `middlewares/error-handler.middleware.ts` (ya estaba planificado en
  la estructura, ahora se le da contenido real):

```typescript
// middlewares/error-handler.middleware.ts
import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err); // loguear server-side, nunca mostrar el stack al usuario
  res.status(500).render("pages/500", { title: "Error interno" });
}
```

- Montar **al final** de `app.ts`, después del 404.
- Validación clave: no filtrar `err.message` ni stack trace a la vista.

### 6.3 Validación de formulario de registro (frontend)

**No es AJAX** (es validación de formulario antes del submit, JS puro del
lado del navegador — el submit en sí puede seguir siendo un POST normal con
`redirect`).

Archivo: `public/js/register-validation.js`, importado en `views/pages/register.ejs`.

Reglas a validar antes de permitir el submit (`e.preventDefault()` si falla):

- `name`, `lastname`, `email`, `password` no vacíos (ni solo espacios).
- Sin espacios al principio/final en ningún campo.
- Email con formato válido (regex estándar).
- Password:
  - mínimo 8 caracteres
  - al menos una letra
  - al menos un número
  - al menos un carácter especial de `! @ # $ % ^ & * ( ) , . ? " : { } | < >`
  - no contiene las cadenas prohibidas: `"password"`, `"1234"`, `"qwerty"`,
    el nombre del sitio, ni el nombre/email ingresado en el mismo formulario
  - no es igual al email ingresado
- Mostrar mensajes de error específicos por campo, no un alert genérico.

### 6.4 Carrito en sesión (`express-session`)

**Requisito actualizado: SÍ es AJAX.** El sprint original lo planteaba con
`<form>` + `redirect`, pero el mockup de UI (Tailwind, botones `+`/`-` y
"Quitar" inline junto al total, sin ningún indicio de recarga) exige que la
pantalla se actualice sin parpadeo. Se implementa con `fetch` hacia rutas
bajo `/api/cart/*`, que devuelven JSON con el carrito actualizado, y el
frontend reescribe solo los números afectados (cantidad, subtotal, total,
contador del header) vía JS.

La vista `/cart` sigue siendo `pages.controller.getCart` con `res.render`
para la **carga inicial** (primer HTML con los ítems ya pintados desde el
servidor, bueno para no depender de JS para ver el carrito la primera vez).
A partir de ahí, cada clic en `+`, `-` o "Quitar" es AJAX y no vuelve a pedir
la página completa.

Requisitos:

- Instalar y configurar `express-session` en `app.ts`.
- **Importante:** `express-session` se usa **únicamente** para el carrito,
  no para login/auth (eso queda para cuando exista autenticación real).
- El carrito vive en `req.session.cart` y solo contiene
  `{ productId: number, quantity: number }[]` — nunca el producto completo.

```typescript
// models/cart.model.ts
export interface SessionCartItem {
  productId: number;
  quantity: number;
}
```

`services/cart.service.ts` (contenido real, ya existía el archivo vacío —
no cambia respecto a la versión anterior, la lógica de negocio es la misma,
solo cambia quién la invoca):

```typescript
export const cartService = {
  addItem(session: any, productId: number) {
    const cart: SessionCartItem[] = session.cart ?? [];
    const existing = cart.find(i => i.productId === productId);
    if (existing) existing.quantity += 1;
    else cart.push({ productId, quantity: 1 });
    session.cart = cart;
  },

  updateQuantity(session: any, productId: number, delta: number) {
    const cart: SessionCartItem[] = session.cart ?? [];
    const item = cart.find(i => i.productId === productId);
    if (!item) return;
    item.quantity += delta;
    session.cart = item.quantity <= 0
      ? cart.filter(i => i.productId !== productId)
      : cart;
  },

  removeItem(session: any, productId: number) {
    const cart: SessionCartItem[] = session.cart ?? [];
    session.cart = cart.filter(i => i.productId !== productId);
  },

  clear(session: any) {
    session.cart = [];
  },

  async getCartWithDetails(session: any) {
    const cart: SessionCartItem[] = session.cart ?? [];
    const items = await Promise.all(
      cart.map(async (i) => {
        const product = await productRepository.findById(i.productId);
        return {
          productId: i.productId,
          quantity: i.quantity,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          subtotal: product.price * i.quantity,
        };
      })
    );
    const total = items.reduce((sum, i) => sum + i.subtotal, 0);
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    return { items, total, count };
  },
};
```

**Rutas** — la carga inicial de la página sigue en `pages.routes.ts`; las
acciones que modifican el carrito pasan a `routes/api/cart.routes.ts`:

```typescript
// routes/pages.routes.ts
router.get("/cart", pagesController.getCart); // solo GET, render inicial
```

```typescript
// routes/api/cart.routes.ts
import { Router } from "express";
import { cartController } from "../../controllers/api/cart.controller";

const router = Router();

router.post("/add/:productId", cartController.addItem);
router.patch("/increase/:productId", cartController.increaseItem);
router.patch("/decrease/:productId", cartController.decreaseItem);
router.delete("/remove/:productId", cartController.removeItem);
router.delete("/clear", cartController.clearCart);

export default router;
```

**Controller de API** (`controllers/api/cart.controller.ts`) — cada método
llama al mismo `cartService` y responde JSON con el carrito ya recalculado,
para que el frontend no tenga que volver a pedir nada:

```typescript
// controllers/api/cart.controller.ts
export const cartController = {
  addItem: async (req, res) => {
    const productId = Number(req.params.productId);
    cartService.addItem(req.session, productId);
    const cart = await cartService.getCartWithDetails(req.session);
    res.json(cart);
  },

  increaseItem: async (req, res) => {
    const productId = Number(req.params.productId);
    cartService.updateQuantity(req.session, productId, +1);
    const cart = await cartService.getCartWithDetails(req.session);
    res.json(cart);
  },

  decreaseItem: async (req, res) => {
    const productId = Number(req.params.productId);
    cartService.updateQuantity(req.session, productId, -1);
    const cart = await cartService.getCartWithDetails(req.session);
    res.json(cart);
  },

  removeItem: async (req, res) => {
    const productId = Number(req.params.productId);
    cartService.removeItem(req.session, productId);
    const cart = await cartService.getCartWithDetails(req.session);
    res.json(cart);
  },

  clearCart: async (req, res) => {
    cartService.clear(req.session);
    const cart = await cartService.getCartWithDetails(req.session);
    res.json(cart);
  },
};
```

**Frontend** (`public/js/cart.js`, importado en `views/pages/cart.ejs`) —
cada botón manda su `fetch` y reescribe el DOM con la respuesta, sin tocar
`window.location`:

```javascript
async function updateCartUI(cart) {
  document.querySelectorAll("[data-cart-item]").forEach(el => {
    const productId = Number(el.dataset.cartItem);
    const item = cart.items.find(i => i.productId === productId);
    if (!item) { el.remove(); return; }
    el.querySelector("[data-quantity]").textContent = item.quantity;
    el.querySelector("[data-subtotal]").textContent = item.subtotal.toLocaleString("es-AR");
  });
  document.querySelector("[data-cart-total]").textContent = cart.total.toLocaleString("es-AR");
  document.querySelector("[data-cart-count]").textContent = cart.count; // ícono del header
  if (cart.items.length === 0) {
    document.querySelector("[data-cart-empty]")?.classList.remove("hidden");
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cart-action]");
  if (!btn) return;

  const { cartAction, productId } = btn.dataset;
  const endpoints = {
    increase: { method: "PATCH", url: `/api/cart/increase/${productId}` },
    decrease: { method: "PATCH", url: `/api/cart/decrease/${productId}` },
    remove:   { method: "DELETE", url: `/api/cart/remove/${productId}` },
    clear:    { method: "DELETE", url: `/api/cart/clear` },
  };
  const { method, url } = endpoints[cartAction];

  const res = await fetch(url, { method });
  const cart = await res.json();
  updateCartUI(cart);
});
```

Escenarios de validación (del sprint, no cambian — solo cambia el mecanismo
de actualización de pantalla, no el comportamiento):

- Ver carrito combina sesión + datos reales del producto (nunca confiar en
  precio guardado en sesión).
- ➕ suma 1, ➖ resta 1, en 0 elimina el ítem.
- "Vaciar carrito" reinicia a `[]`.
- Carrito vacío → mensaje amigable + botón volver al inicio.
- El carrito se pierde al cerrar el navegador (comportamiento por defecto de
  `express-session` sin cookie persistente — no configurar `maxAge` largo).

### 6.5 Checkout temporal

**No es AJAX**, es una vista estática sin lógica.

```typescript
router.get("/checkout", pagesController.getCheckoutPlaceholder);
```

```typescript
getCheckoutPlaceholder: (req, res) => {
  res.render("pages/checkout", {
    title: "Checkout",
    message: "Checkout disponible en el próximo sprint",
  });
},
```

Vista con dos botones: volver a `/cart` y volver a `/`. Nada de lógica de
negocio ni de sesión acá — es un placeholder deliberado.

### 6.6 Home — "Te puede interesar" (hasta 5 productos sugeridos)

**No es AJAX.**

```typescript
// services/product.service.ts
async getSuggested(limit = 5): Promise<Product[]> {
  const products = await productRepository.findAll();
  return products.slice(0, limit).map(withImageFallback);
  // BONUS: reemplazar por selección aleatoria con shuffle + slice
}
```

Se inyecta en `getHome` junto a `categories` y `heroProducts` ya existentes,
y se pinta con el mismo partial `molecules/product.ejs` ya creado.

### 6.6b Home — Nav de categorías con ícono y banners promocionales (nuevo)

Estos dos componentes aparecen en el mockup de Home y no estaban
documentados. Ninguno de los dos necesita cambios de schema.

**Nav de categorías con ícono:** es el mismo `organisms/categories-nav.ejs` /
mismo dato (`categoryService.findAll()`) que ya usás en
`/categories/:category`, pero
la Home lo pinta como barra horizontal de íconos en vez de grid. La tabla
`categories` **no tiene columna de ícono** y no hace falta agregarla — el
ícono es una decisión puramente visual. Resolverlo con un mapeo estático en
el frontend:

```typescript
// src/utils/category-icons.ts (helper TS, no es un archivo de views/ —
// se importa desde el controller o desde organisms/categories-nav.ejs)
const CATEGORY_ICONS: Record<string, string> = {
  "Electrónica": "cpu",
  "Alimentos": "utensils",
  "Bebidas": "coffee",
  "Indumentaria": "shirt",
  "Juegos": "gamepad-2",
  "Automotor": "car",
  "Hogar": "home",
  "Otros": "gift-box",
};
```

Si el nombre de la categoría no está en el mapeo, usar un ícono genérico de
fallback (ej. `tag`). Esto va del lado de la vista/partial, no del service —
el service sigue devolviendo solo `{ id, name, description }`.

**Banners promocionales (carrusel):** contenido de marketing (Disney+,
combos, HBO Max), **no vinculado a ninguna tabla** del schema actual — no
son productos ni categorías. Se resuelve con un array hardcodeado, similar a
como arrancó `categories.repository.ts` antes de tener DB:

```typescript
// services/promo.service.ts (nuevo, no tiene repository — no hay tabla)
export const promoService = {
  getActiveBanners() {
    return [
      {
        title: "50% OFF en Combo Plus",
        subtitle: "Canjeando 50.000 puntos",
        imageUrl: "https://res.cloudinary.com/<cloud_name>/.../combo-plus.png",
        linkUrl: "/products?promo=combo-plus",
      },
      {
        title: "50% OFF en HBO Max",
        subtitle: "Canjeando 50.000 puntos",
        imageUrl: "https://res.cloudinary.com/<cloud_name>/.../hbo-max.png",
        linkUrl: "/products?promo=hbo-max",
      },
    ];
  },
};
```

Se inyecta en `getHome` como `banners`, junto a `categories`,
`heroProducts` y `suggested`. Si más adelante se quiere administrar desde un
panel, ahí sí ameritaría una tabla `promotions` — **no crearla ahora**, es
fuera de alcance.

### 6.7 Home — "Los más pedidos" (hasta 10 productos)

**No es AJAX.** Requiere un flag en el modelo (ver nota de schema).

> Nota: la tabla `products` actual no tiene columna para marcar "destacado".
> Si se quiere implementar el flag, agregar migración:
> `ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0;`
> Alternativa sin tocar el schema: seleccionar aleatoriamente 10 productos
> (más simple, cumple el requisito igual).

```typescript
async getMostOrdered(limit = 10): Promise<Product[]> {
  // opción simple sin flag: aleatorios
  const products = await productRepository.findAll();
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit).map(withImageFallback);
}
```

### 6.8 Detalle de producto `/products/:id`

**No es AJAX.** (Esta ruta todavía no estaba implementada en el proyecto —
solo se hizo `/categories/:category`).

```typescript
router.get("/products/:id", pagesController.getProductDetail);
```

```typescript
getProductDetail: async (req, res, next) => {
  const id = normalizeId(req.params.id); // ver 3.9
  if (id === null) return res.status(400).render("pages/400", { title: "ID inválido" });

  const product = await productService.findById(id);
  if (!product) return res.status(404).render("pages/404", { title: "Producto no encontrado" });

  const related = await productService.getRelated(product.id, product.categories);

  res.render("pages/product-detail", {
    title: product.name,
    product,
    related,
  });
},
```

Vista debe mostrar: nombre, precio, descripción, categorías, imagen (con
fallback de Cloudinary), botón "Agregar al carrito" (deshabilitado si
`!product.inStock`, ver 3.10), y sección de relacionados.

**Productos relacionados** (hasta 4, misma categoría, aleatorios si hay más
de 4, mensaje amigable si no hay ninguno):

```typescript
async getRelated(productId: number, categoryIds: number[], limit = 4): Promise<Product[]> {
  if (categoryIds.length === 0) return [];
  const candidates = await productRepository.findByCategories(categoryIds);
  const filtered = candidates.filter(p => p.id !== productId);
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit).map(withImageFallback);
}
```

Reutilizar `molecules/product.ejs` para pintar tanto el listado principal como
los relacionados.

### 6.9 Normalización de IDs

**No es AJAX**, es un helper puro usado por varios controllers.

```typescript
// middlewares/normalizeId.ts  (o utils/, según prefieras)
export function normalizeId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
```

Uso: ID no numérico → 400. ID numérico pero inexistente en DB → 404 (esto
último se resuelve en el controller, después de consultar el repository, no
en `normalizeId` mismo — `normalizeId` solo valida formato).

Aplicar en toda ruta que reciba `:id` (`/products/:id`, futuros
`/categories/:id` si se cambia de slug a id numérico, etc).

### 6.10 Indicador "Sin stock"

**No es AJAX.**

- En `product.service.ts`, agregar `inStock: product.stock > 0` a cada
  producto antes de mandarlo a la vista (ver tabla de atributos derivados).
- En `molecules/product.ejs`:

```ejs
<% if (!product.inStock) { %>
  <span class="badge badge-out-of-stock">Sin stock</span>
<% } %>
<button
  class="btn-add-to-cart"
  <%= !product.inStock ? "disabled" : "" %>
>
  Agregar al carrito
</button>
```

- Validación: el botón deshabilitado en el HTML no alcanza por sí solo —
  el controller de `POST /cart/add/:productId` también debe rechazar
  (con mensaje, no silenciosamente) si el producto tiene `stock === 0`.

### 6.11 Total del carrito en el header

**Mixto:** en la mayoría de las páginas (home, detalle, listado, etc.) el
contador se recalcula server-side en cada `render` vía middleware — no hace
falta AJAX ahí, el header ya viaja actualizado con el HTML. La excepción es
mientras el usuario está parado en `/cart`: ahí el contador se actualiza en
el mismo `fetch` de 3.4 (el JSON que devuelve `cartService.getCartWithDetails`
ya incluye `count`), sin pedir nada aparte.

- El total de ítems (`sum(quantity)`, no `sum(subtotal)`) se necesita en
  **todas** las vistas, no solo en `/cart`. La forma más limpia para el caso
  general (fuera de `/cart`): un middleware que corra antes de cualquier
  `render` y agregue la variable a `res.locals`.

```typescript
// middlewares/injectCartCount.middleware.ts
export function injectCartCount(req, res, next) {
  const cart: SessionCartItem[] = req.session.cart ?? [];
  res.locals.cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  next();
}
```

```typescript
// app.ts
app.use(injectCartCount); // antes de montar routes
```

En `organisms/header.ejs`, usar `<%= cartCount %>` directamente (ya
disponible vía `res.locals`, no hace falta pasarlo manualmente en cada
`render`).

### 6.12 Ordenar productos por precio — `/products?sort=asc|desc`

**No es AJAX** (el sprint lo pide explícitamente server-rendered vía query
string). Esto es distinto del buscador AJAX que habíamos charlado antes como
posible fase futura — no confundir ambos.

```typescript
// repositories/product.repository.ts
async findAll(sort?: "asc" | "desc"): Promise<Product[]> {
  const order = sort === "desc" ? "DESC" : "ASC";
  return db.prepare(`SELECT * FROM products ORDER BY price ${order}`).all() as Product[];
}
```

```typescript
// controllers/pages/pages.controller.ts
getProducts: async (req, res) => {
  const sort = req.query.sort === "desc" ? "desc" : "asc";
  const products = await productService.findAll(sort);
  res.render("pages/products", { title: "Productos", products });
},
```

### 6.13 Buscador de productos — `/search?query=...`

**No es AJAX** (mismo criterio que 3.12 — server-rendered, sin fetch).

```typescript
router.get("/search", pagesController.searchProducts);
```

```typescript
searchProducts: async (req, res) => {
  const query = (req.query.query as string)?.trim() ?? "";
  const products = query
    ? await productService.searchByName(query)
    : [];
  res.render("pages/search-results", { title: `Resultados para "${query}"`, products, query });
},
```

```typescript
// repositories/product.repository.ts
async searchByName(query: string): Promise<Product[]> {
  return db.prepare(`SELECT * FROM products WHERE name LIKE ?`).all(`%${query}%`) as Product[];
}
```

Form de búsqueda en `molecules/search.ejs` (incluido dentro de
`organisms/header.ejs`), `method="GET"` hacia `/search`.
Si no hay resultados, mensaje amigable (mismo patrón que categoría vacía).

> Nota de coherencia: si en una fase futura se decide migrar este buscador a
> AJAX (como se había planteado en una charla anterior), sería un cambio de
> ruta nueva bajo `/api/products` conviviendo con esta, no un reemplazo — la
> versión server-rendered en `/search` seguiría existiendo para navegación
> directa y SEO.

### 6.14 Layout base

Ya existe `views/layout.ejs` en el proyecto actual — **verificar** que:

- Todas las vistas lo usen excepto `login.ejs` y `register.ejs` (estas
  suelen ir sin header/footer completo, según el sprint original — decisión
  de diseño, no obligatoria si tu UI ya las incluye).
- Incluye `organisms/header.ejs` (con buscador y contador de carrito) y
  `organisms/footer.ejs`.

---

## 7. Checklist de pasos — para pedirle al orquestador de a uno

Cada paso es autocontenido: se le puede pegar al orquestador como "Hacé el
Paso N de este documento" y tiene todo lo que necesita sin releer el
documento completo. Como un solo modelo hace backend y vista, cada paso de
página incluye ambas cosas juntas — ya no hay que coordinar dos documentos
por separado.

- [ ] **Paso 1 — Fundamentos backend.** Verificar/crear
  `config/database.ts`, `config/env.ts`, `config/cloudinary.ts`. Crear
  `middlewares/normalizeId.ts`, `middlewares/injectCartCount.middleware.ts`,
  `middlewares/error-handler.middleware.ts`. Corregir
  `repositories/product.repository.ts` y `services/product.service.ts`
  para usar la relación N:M vía `product_categories` (sección 1.2) y
  agregar el helper `withImageFallback` (sección 2.3). **Bloqueante** —
  todo lo demás de productos depende de esto.

- [ ] **Paso 2 — Componentes base del layout (vista).** Generar
  `templates/layout.ejs`, `organisms/header.ejs`, `molecules/header-right.ejs`,
  `molecules/search.ejs`, `molecules/profile-btn.ejs`, `atoms/profile-pic.ejs`,
  `molecules/cart-icon.ejs`, `atoms/badge-counter.ejs`,
  `organisms/header-mobile.ejs`, `organisms/footer.ejs`,
  `organisms/footer-mobile.ejs`, a partir de `Header.png`, `Header-Right.png`,
  `HeaderMobile.png`, `Search.svg`, `ProfileBtn.png`, `ProfilePic.png`,
  `Cart.png`, `Cart/Badge.svg`, `Footer.png`, `FooterMobile.png` (sección 3).
  Definir clases `.btn-primary`/`.btn-secondary`/`.btn-disabled` (`Button.png`)
  y la guía tipográfica H1/H2/H3. Todavía sin datos reales — usar props.

- [ ] **Paso 3 — Nav de categorías (vista) + corrección de datos (backend).**
  Generar `organisms/categories-nav.ejs` (`Categories.png`) y
  `organisms/categories-dropdown.ejs` (`Categories-1.png`), recibiendo
  `categories` (ya corregido en Paso 1 para N:M).

- [ ] **Paso 4 — Componentes de producto (vista).** Generar
  `molecules/product.ejs` (`Product.png`), `organisms/product-hero.ejs`
  (`ProductHero.png`), `organisms/product-grid.ejs` (envuelve N
  `molecules/product.ejs` con título), `molecules/product-row.ejs`
  (`ProductRow.png`, sin página que lo use todavía, dejarlo listo).

- [ ] **Paso 5 — Home completo (backend + vista).**
  Backend: `promoService.getActiveBanners()` (hardcodeado),
  `productService.getSuggested`, `productService.getMostOrdered`,
  inyectados en `pagesController.getHome` junto a `categories` (secciones
  6.6, 6.6b, 6.7). Vista: ensamblar `pages/index.ejs` con
  `home1.page.png` + `home2.page.png` y los componentes de los Pasos 2-4,
  en el orden de la tabla 4.1.

- [ ] **Paso 6 — Carrito completo (backend + vista + AJAX).**
  Backend: `services/cart.service.ts`, `controllers/api/cart.controller.ts`,
  `routes/api/cart.routes.ts` (sección 6.4). Vista: generar
  `molecules/numeric.ejs` (`Numeric.png`) y `organisms/cart-item.ejs`
  (`CartItem.png`) con los atributos `data-*` de la sección 5 ya puestos,
  ensamblar `pages/cart.ejs` con `cart.page.png` (tabla 4.2). Recién al
  final de este paso escribir `public/js/cart.js` — necesita que los
  `data-*` ya existan en el HTML generado.

- [ ] **Paso 7 — Contador de carrito en header.** Confirmar que
  `injectCartCount` (Paso 1) esté montado en `app.ts` y que
  `molecules/header-right.ejs` reciba `cartCount` en cada `render`
  (sección 6.11).

- [ ] **Paso 8 — Detalle de producto (backend + vista).**
  Backend: route `GET /products/:id`, `pagesController.getProductDetail`,
  `productService.findById` + `getRelated`, `inStock` (secciones 6.8,
  6.10). Vista: generar `molecules/breadcrumb.ejs` (`BreadCrumb.png`) y
  ensamblar `pages/product-detail.ejs` con `product.page.png`
  (tabla 4.3).

- [ ] **Paso 9 — Login y Register (backend + vista).**
  Vista: generar `atoms/input.ejs` (`Input.png`), ensamblar
  `pages/login.ejs` con `login.page.png` (tabla 4.4, ojo con
  `name="email"`) y `pages/register.ejs` con `register.page.png`
  (tabla 4.5, `name`/`id` exactos: `name`, `lastname`, `email`,
  `password`). Backend: `public/js/register-validation.js` (sección 6.3),
  recién después de que el formulario ya tenga esos `name`/`id`.

- [ ] **Paso 10 — 404 / 500 (backend + vista).** Middleware catch-all y
  `error-handler` en `app.ts`, más `pages/404.ejs` y `pages/500.ejs`
  reutilizando componentes ya generados (secciones 6.1, 6.2, 4.6).

- [ ] **Paso 11 — Categoría y Checkout (backend + vista).**
  `pages/category.ejs` (reutiliza `organisms/product-grid.ejs` +
  `molecules/breadcrumb.ejs`) y `pages/checkout.ejs` (placeholder estático),
  ya definidos en secciones 6.5 y 4.6 — sin mockup propio, mismo lenguaje
  visual que el resto.

- [ ] **Paso 12 — Ordenar y buscar (backend + vista).**
  `GET /products?sort=`, `GET /search?query=` (secciones 6.12, 6.13),
  reutilizando `organisms/product-grid.ejs` para pintar resultados.

- [ ] **Paso 13 — Componentes opcionales/futuros.** Generar
  `organisms/dialog.ejs` (`Dialog.png`), `organisms/menu-desktop.ejs`,
  `organisms/menu-mobile.ejs`, `atoms/menu-item.ejs` (`MenuDesktop.png`,
  `MenuMobile.png`, `MenuItem.png`). No se conectan a ninguna lógica
  todavía — quedan listos para cuando el spec incorpore esas secciones
  (Mis Compras, Favoritos, Historial).

- [ ] **Paso 14 — WebSockets (opcional, fase aparte).** Ver sección 8 — no
  forma parte del alcance actual, solo abordar si se decide extender el
  proyecto explícitamente.

---

## 8. Fase futura (NO implementar ahora): tiempo real con WebSockets

Se documenta para que quede registrado el alcance, pero **no forma parte del
alcance actual** — depende de que el carrito en sesión (sección 6.4) ya esté
terminado y estable.

Objetivo: que el contador del carrito y la vista `/cart` se actualicen sin
recargar cuando el estado cambia (incluso entre pestañas).

Requisitos de alto nivel (para cuando se aborde):

- Servidor WebSocket (`ws`) montado sobre el mismo servidor HTTP de Express.
- Un servicio centralizado (`services/socket.service.ts`) que:
  - registre/elimine conexiones activas
  - haga broadcast de eventos
  - serialice mensajes con formato fijo: `{ type: string, payload: object }`
    (ej: `{ type: "cartUpdated", payload: { items: 4, total: 8500 } }`)
- Los controllers **nunca** tocan el WebSocket directamente — todo pasa por
  el servicio.
- Cliente: reconexión automática si se corta la conexión, indicador visual
  de "Conectado"/"Desconectado".
- Esto es networking real-time, no reemplaza las rutas AJAX de
  `/api/cart/*` que ya existen — las complementa (el POST sigue
  actualizando la sesión; el WebSocket solo *notifica* a otras pestañas que
  el estado cambió).

---

## 9. Checklist de validación general (aplica a todo lo anterior)

- [ ] Nada de lo nuevo usa JSON como fuente de datos — todo pasa por SQLite.
- [ ] Ningún controller contiene queries SQL ni lógica de negocio.
- [ ] `req.session.cart` solo contiene `{ productId, quantity }`, nunca el
      producto completo ni datos sensibles.
- [ ] Las rutas marcadas "No es AJAX" no usan `fetch` en ningún `<script>`.
      La única excepción es el carrito (sección 6.4): `+`, `-`, "Quitar" y
      "Vaciar" SÍ usan `fetch` hacia `/api/cart/*`; todo lo demás (búsqueda,
      orden, checkout, registro, home) sigue siendo server-rendered.
- [ ] El nombre de cada `.ejs` generado coincide con el sugerido en la
      tabla de la sección 3 o 4 — no inventar nombres nuevos.
- [ ] Las variables EJS usadas coinciden exactamente con las que pasa el
      controller correspondiente.
- [ ] Los atributos `data-*` de la sección 5 están presentes y sin
      renombrar en los pasos que aplican (6, 8).
- [ ] Un componente que se repite en 2+ lugares (`molecules/product.ejs`,
      `organisms/categories-nav.ejs`, `organisms/footer.ejs`,
      `organisms/product-grid.ejs`) se generó **una sola vez** y se
      reutiliza con `include`, nunca se duplica el markup.
- [ ] Antes de crear un archivo nuevo en `atoms/` o `molecules/`, se
      confirmó que el elemento se reutiliza en 2+ lugares — si es un solo
      uso, va inline en el `organism`/`page` que lo contiene.
- [ ] Mobile-first con Tailwind, aunque no haya mockup mobile específico
      para esa página todavía.
- [ ] 404 y 500 no filtran información técnica (stack traces, queries) al
      usuario final.
- [ ] Todo ID recibido por URL pasa por `normalizeId` antes de llegar al
      repository.
- [ ] No se inventaron rutas ni endpoints fuera de los ya definidos en
      este documento.
