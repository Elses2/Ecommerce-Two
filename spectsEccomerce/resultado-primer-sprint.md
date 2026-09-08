# Retrospectiva Técnica — Sprint 1

> Documento de cierre del Sprint 1. Compara la ejecución real contra el plan original de
> `ecommerce-spec-completa.md` (Pasos 0–13 de la sección 7). Complementa el spec; no lo reemplaza.
> Estado: Pasos 0–13 completos, tag `sprint-1` actualizado al HEAD de esta rama.

## 0. Resumen de ejecución

| Paso | Alcance | Rama / PR |
|---|---|---|
| 0 | Saneamiento de base (deps, TS baseline, git hygiene, scaffold) | `feature-index-and-login-martin` → PR #29 + tag inicial |
| 1 | Capa de datos (6 tablas N:M, repository/service, seed) | incluido en PR #29 |
| 2 | Integración Cloudinary (`withImageFallback` §2.3) | `feature/step-2-cloudinary` → PR #30 (mergeada) |
| 3 | Nav de categorías + íconos Lucide (§6.6b) | entró a `dev` vía merge de #30 |
| 4 | Componentes de producto (card, hero, grid, row) | PR #31 |
| 5 | Home completo (backend + ensamblaje tabla 4.1) | PR #32 |
| 6 | Carrito completo (sesión + API + AJAX) | PR #33 |
| 7 | Contador de carrito (verificación + fix de comentario) | agrupado en PR #34 |
| 8 | Detalle de producto + breadcrumb + relacionados | PR #34 |
| 9 | Login/Register (vistas + validación frontend §6.3) | PR #35 |
| 10 | Páginas 404/500 (catch-all + errorHandler) | PR #36 |
| 11 | Categoría + Checkout placeholder | PR #37 |
| 12 | Ordenar y buscar (server-rendered) + carrito global | PR #38 |
| 13 | Componentes opcionales (menús + dialog) | PR #39 (esta rama) |

Hallazgo de arranque: el spec fue escrito contra otra iteración del proyecto — cada "corregir/ya existe"
apuntaba a archivos inexistentes. Todo el Paso 1 se ejecutó como **creación desde cero** (~643 líneas,
33 archivos) y el resto del sprint reutilizo esa base.

---

## 1. Corrección crítica: carrito global

**Síntoma**: el botón "Agregar al carrito" solo funcionaba donde `cart.js` estaba cargado: `/cart` y
`/products/:id`. En Home y Categoría los `data-*` existían pero nadie escuchaba los clics.

**Causa real (más matizada que "faltaba el endpoint")**: el endpoint `add` sí existía desde el Paso 6
(`add: (id) => ({ method: "POST", url: "/api/cart/add/${id}" })`, forma función equivalente a la forma
objeto); lo que faltaba era **disponibilidad global del script** — estaba incluido por página, no en el layout.

**Solución**: `<script src="/js/cart.js" defer>` movido a `templates/layout.ejs` (antes de `</body>`) y
removido de `cart.ejs` y `product-detail.ejs` (carga única, cero duplicados). Además se **verificaron**
— en vez de reescribir — los guards de `updateCartUI`: `querySelectorAll().forEach` + `if`-guards ya
evitaban errores en páginas sin `data-cart-total` (harness node: 4 casos borde OK). El badge
`data-cart-count` renderiza su `<span>` incondicionalmente (sin `if` de EJS que lo remueva del DOM).

**Verificación**: exactamente 1 tag de script por página en 6 rutas; add desde Home actualiza el badge
de header (cookie jar + server render).

---

## 2. Mejoras de seguridad y robustez

- **`normalizeId` dual**: middleware con regex para `/api/*` + **helper puro** `src/utils/normalizeId.ts`
  (`Number` + `isInteger` + `> 0`) para controllers de páginas (§6.9: formato inválido → 400; id
  inexistente → 404 resuelto en el controller, nunca en el validador).
- **Bug encontrado y corregido**: el fallback del middleware parseaba `DELETE /api/cart/clear` como
  `:id` ("clear") y lo rechazaba con 400. Fallback restringido a colecciones con id
  (`products|categories|orders`); regresión verificada (`/api/products/abc` sigue 400).
- **XSS**: la query de búsqueda se ecoa con `<%= %>` (escapado). Probe con `<script>alert(1)</script>`
  → 0 ocurrencias crudas en el HTML.
- **500 sin filtración**: log server-side con prefijo; el template jamás recibe `err.message`/stack.
  Fallback si el propio render del 500 falla (sin bucle de errores). *Trade-off documentado*: los
  errores JSON de `/api/*` mantienen `err.message` (contrato preexistente).
- **Validaciones pre-mutación de sesión**: stock 0 → 400 "Product out of stock" (§6.10), producto
  inexistente → 404 (§6.9), sesión intacta en ambos casos. Ids huérfanos de sesión se podan
  (auto-sanidad de `getCartWithDetails`).
- **Sesión mínima**: el carrito vive como `{ productId, quantity }` — nunca precio/producto completo;
  precios SIEMPRE recalculados desde la DB. Cookie sin `maxAge` (muere con el navegador), `httpOnly`.

---

## 3. Decisiones de arquitectura

- **N:M desde cero**: `product_categories` con PK compuesta + FKs (§1.1) — el spec asumía un "fix"
  sobre código que no existía.
- **Fisher-Yates** para relacionados (§6.8): el `sort(() => Math.random() - 0.5)` del spec es sesgado;
  mismo contrato, aleatoriedad uniforme.
- **better-sqlite3 sync, sin ORM** (D5): firmas sync donde el spec muestra `async` — sin promesas falsas.
- **Modelo de dinero REAL** (§1.1): columnas numéricas, formato `es-AR` en el borde de vista
  (el mockup decía "PUNTOS" — cosmético, se mantiene como caption).
- **`express-session` estrictamente para el carrito** (§6.4): nada de auth; `saveUninitialized: false`
  para que la cookie nazca con la primera mutación del carrito.
- **Árbol atómico**: `views/templates/{atoms,molecules,organisms,pages}` + multi-root en `app.ts`;
  el spec literal dice `views/pages/*` — misma intención, resolución correcta del layout compartido.
- **Links canónicos** `/categories/:id`: nav, dropdown y breadcrumb retargeteados (§4.6 lo prescribe;
  `products?category` aparece cero veces en el spec).
- **Error handler con rama JSON** para `/api/*`: el AJAX del carrito nunca recibe HTML.
- **`list()` conservado junto a `findAll(sort)`**: plegar el orden por precio habría cambiado
  silenciosamente el orden de la Home.

---

## 4. Mockups vs realidad

- **`MenuItem.png` es un PNG 100% transparente** (0 píxeles visibles, verificado con extracción de
  alpha): estilos de fila extrapolados de MenuDesktop/MenuMobile y flaggeados en el código.
- **Spec > mockup** (cuando chocan, gana el spec — documentado en cada archivo):
  - Register: mockup sin nombre/apellido y con "Repite tu contraseña" → §4.5 manda exactamente
    `name`, `lastname`, `email`, `password` sin confirmación.
  - Botones primarios `.btn-primary` teal aunque el mockup los pinta grafito (login, register, "Ir a Pagar").
  - Título "Productos relacionados" (tabla 4.3) aunque el mockup dice "También te puede interesar".
  - Login: el mockup pide "usuario" pero la DB usa `email` → `type="email" name="email"` (§4.4 lo confirma).
- **Imágenes**: las URLs de ejemplo del spec traen el placeholder literal `<cloud_name>` (activos
  inexistentes) → fallback local `/img/fallback.png` vía `withImageFallback`, que §2.2 permite
  explícitamente ("o servida como estática en /public"). Aplica en cards, hero y banners.
- **Omitidos por modelo de datos**: galería de thumbnails en el detalle (una sola `image_url`) y la
  barra de categorías oscura del mockup (fuera de la tabla 4.3).
- **Omitidos por contrato**: "Vaciar carrito" existe aunque el mockup no lo muestra (§5 lo exige);
  confirm-password NO existe porque §6.3 no define regla para él.

---

## 5. Alcance respetado

- **Checkout = placeholder estático** ("Checkout disponible en el próximo sprint", §6.5): dos botones,
  cero lógica de negocio o sesión.
- **Sin backend de auth**: los formularios hacen POST a `/login`|`/register` que aún no existen
  (line 136 del spec excluye auth del alcance); la sesión sigue siendo solo del carrito.
- **WebSockets: explícitamente Sprint 2** (§8). Nada de tiempo real en este sprint.
- **Swagger**: deps mantenidas por directriz del maintainer (el spec las prohibía — desvío aprobado
  para el futuro desarme del monolito).
- Sin linter/CI; las páginas legacy de `src/views/` quedaron como código muerto (borrado pendiente
  de decisión del maintainer).

---

## 6. Deuda técnica y pendientes (honestidad de cierre)

1. `dev.db-shm` / `dev.db-wal` (sidecars WAL) no cubiertos por `.gitignore` — `chore` de una línea.
2. Breadcrumb: pinta un `›` inicial cuando no hay `back` (guard `i > 0` de una línea, pendiente).
3. `format:check` de Prettier falla **pre-existente** en el repo (sin config); no se reformateó para
   mantener los commits sin churn.
4. `dist/views` solo copia el árbol legacy: producción requiere la carpeta raíz `views/` (deploy note).
5. `normalizeId.middleware.ts` captura el grupo 1 del regex (nombre de recurso, no id): hoy inofensivo
   (router de productos vacío), revisar cuando crezca el API.
6. Los errores JSON de la API exponen `err.message` — endurecer es un cambio de contrato aparte.
7. PRs #31–#38 (Pasos 4–12) pendientes de merge; esta PR de cierre incluye todo el sprint.
