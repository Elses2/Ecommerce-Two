# Cambios no registrados en el spec

> 📌 **Documento histórico.** Refleja el estado del proyecto en el momento en que se escribió
> y no se actualiza. La especificación vigente está en [`SPEC.md`](./SPEC.md).


> Este documento cubre los cambios funcionales y de infraestructura
> que **no están documentados** en `ecommerce-spec-sprint1.md` ni en
> `resultado-primer-sprint.md`. Está pensado para ser entregado a la IA
> de desarrollo (opencode / orquestador, modelo Ling 3.0 Flash) como
> contexto adicional antes de implementar nuevas funcionalidades.

---

## 0. Resumen

| Cambio | PR | Estado |
|---|---|---|
| JSDoc comments en todo el código TypeScript | #56 | Mergeado a dev |
| Dependencias swagger-jsdoc + swagger-ui-express instaladas | #29 | Mergeado a dev |
| Configuración Swagger completa | **PR #58** | Mergeado a dev |
| Persistencia de sesión en SQLite (better-sqlite3-session-store) | #47 | Mergeado a dev |
| Reestructuración de views (legacy → árbol atómico) | #51 | Mergeado a dev |
| .gitattributes con normalización EOL | #56 | Mergeado a dev |
| Script de seed idempotente (`scripts/seed.ts`) | #29 | Mergeado a dev |
| Imagen fallback (`public/img/fallback.png`) | #29 | Eliminado | Reemplazado por `FALLBACK_IMAGE_URL` configurable vía `.env` |

---

## 1. swagger-jsdoc + swagger-ui-express (PR #58)

### Qué pasó

- `swagger-jsdoc` (`^6.2.8`) y `swagger-ui-express` (`^5.0.1`) ya estaban
  instalados desde PR #29 pero **no estaban configurados**.
- Se implementó la configuración completa:
  - `src/config/swagger.ts` — definición OpenAPI 3.0 con schemas `Cart` y `Product`
  - `src/routes/docs.routes.ts` — router que expone Swagger UI en `/api-docs`
  - `src/app.ts` — monta `docsRouter` antes del catch-all 404
- Se agregaron bloques `@swagger` con annotations a los endpoints:
  - `src/controllers/api/cart.controller.ts` — 5 endpoints (`addItem`, `increaseItem`,
    `decreaseItem`, `removeItem`, `clearCart`)
  - `src/controllers/pages/pages.controller.ts` — 7 endpoints (`getHome`, `getCart`,
    `getProductDetail`, `getCategory`, `getProducts`, `searchProducts`, `getCheckout`)
- La spec se genera automáticamente a partir de los comentarios `@swagger`
  y se sirve como UI interactiva en `/api-docs`.

### Archivos nuevos

| Archivo | Descripción |
|---|---|
| `src/config/swagger.ts` | Configuración OpenAPI 3.0, definición de schemas, paths a escanear |
| `src/routes/docs.routes.ts` | Router que monta `swagger-ui-express` en `/api-docs` |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/app.ts` | Import de `docsRouter` + `app.use('/api-docs', docsRouter)` |
| `src/controllers/api/cart.controller.ts` | Bloques `@swagger` en 5 handlers |
| `src/controllers/pages/pages.controller.ts` | Bloques `@swagger` en 7 handlers |

### Cómo usar

```bash
npm run dev
# luego abrir http://localhost:3000/api-docs
```

### Nota para la IA de desarrollo

 swagger-jsdoc lee los bloques `@swagger` de los archivos listados en la
 configuración (`apis`) y genera el spec OpenAPI en JSON. `swagger-ui-express`
 lo sirve como página HTML interactiva en `/api-docs`. Los `@param` de TypeScript
 normales **no** son leídos por swagger-jsdoc — se deben usar bloques `@swagger`
 separados con la sintaxis OpenAPI. No mezclar ambos en el mismo bloque.

---

## 2. Persistencia de sesión en SQLite (PR #47)

### Qué pasó

- Se instaló `better-sqlite3-session-store` (`^0.1.0`) para persistir las
  sesiones de `express-session` en `dev.db` en lugar de mantenerlas en
  memoria.
- En `src/app.ts` se configuró `SqliteStore` con el cliente `db`:
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
- El carrito ahora sobrevive reinicios del servidor (antes vivía solo en
  memoria de la sesión).

### Por qué no está en el spec

El spec §6.4 describe `express-session` para el carrito pero asume
almacenamiento en memoria. La persistencia en SQLite fue una mejora
posterior que no cambia el contrato de la API ni el comportamiento
visible para el usuario.

---

## 3. JSDoc comments across codebase (PR #56)

### Qué pasó

Se agregaron comentarios JSDoc a **todos los archivos TypeScript**:

- `src/app.ts` — `@fileoverview`, `@param`, `@returns` en el handler 404
- `src/config/database.ts` — funciones `configurePragmas`, `bootstrapSchema`,
  `initDatabase` documentadas
- `src/config/env.ts` — funciones `parsePort`, `getEnvString`,
  `createEnvConfig` documentadas
- `src/config/cloudinary.ts` — comentarios JSDoc
- `src/controllers/api/cart.controller.ts` — `parseProductId` y todos los
  handlers documentados
- `src/controllers/pages/pages.controller.ts` — `getHome`, `getCart`,
  `getProductDetail` documentados
- `src/middlewares/error-handler.middleware.ts` — función principal
  documentada
- `src/middlewares/injectCartCount.middleware.ts` — documentado
- `src/middlewares/normalizeId.middleware.ts` — documentado
- `src/repositories/product.repository.ts` — constructor y `list()`
  documentados
- `src/repositories/category.repository.ts` — documentado
- `src/services/product.service.ts` — `ProductService`, `withDerivedAttrs`,
  `list()` documentados
- `src/services/category.service.ts` — documentado
- `src/services/promo.service.ts` — documentado
- `src/utils/category-icons.ts` — `CATEGORY_ICONS` y `FALLBACK_CATEGORY_ICON`
  documentados
- `src/routes/index.routes.ts` — router documentado
- `src/routes/pages.routes.ts` — router y rutas documentadas

### Nota importante

Los comentarios JSDoc en archivos `.ejs` (templates) son **sintaxis de
comentarios JavaScript** dentro de bloques `<% %>`. Funcionan como
comentarios normales de JS y no afectan el renderizado. No son
documentación JSDoc real (no hay tipos ni herramientas que los parseen
en EJS).

### Error conocido

En `src/config/env.ts`, el JSDoc de `getEnvString` contiene un typo:
`indeifnido` en lugar de `indefinido`. Es en un comentario, no en código
ejecutable.

---

## 4. .gitattributes con normalización EOL

### Qué pasó

Se creó `.gitattributes` con las siguientes reglas:

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

Esto fuerza que todos los archivos de texto se normalicen a LF en
cualquier sistema operativo.

### Impacto

- Los archivos EJS que no tenían salto de línea final ahora pueden ser
  modificados por Git con el flag `\ No newline at end of file`.
- Si un colaborador trabaja en Windows y otro en Linux, los conflictos
  de EOL se reducen significativamente.

---

## 5. Script de seed idempotente (`scripts/seed.ts`)

### Qué pasó

Se creó `scripts/seed.ts` como script independiente que:

1. Inserta 3 categorías (Periféricos, Monitores, Audio) con
   `INSERT OR IGNORE`.
2. Inserta 4 productos (Teclado Mecánico, Mouse Gamer, Monitor 24",
   Headset) con `INSERT OR IGNORE`.
3. Crea los joins N:M en `product_categories` según el spec §1.4.
4. Es re-ejecutable sin duplicar filas gracias al índice UNIQUE en
   `categories.name` y `products.name`.

### Cómo ejecutarlo

```bash
npm run seed
```

El script **no se ejecuta automáticamente** al correr `npm run dev`.
El usuario debe ejecutarlo manualmente después de que `npm run dev`
haya creado el esquema en `dev.db`.

### Nota para la IA de desarrollo

El spec menciona "seed o migración manual" (línea 211) pero no
detalla el mecanismo. El script existe y funciona; es responsabilidad
del desarrollador ejecutarlo.

---

## 6. Imagen fallback — de archivo estático a URL configurable

### Qué pasó

Se eliminó `public/img/fallback.png` (PNG placeholder de 0 bytes) y se
reemplazó por una **URL configurable** mediante la variable de entorno
`FALLBACK_IMAGE_URL`.

### Nuevo mecanismo (spec §2.3 actualizado)

- **Variable**: `FALLBACK_IMAGE_URL` en `.env` y `.env.example`
- **Default**: `https://placehold.co/600x600?text=Sin+imagen` (definido en código, la app arranca sin `.env`)
- **Validación**: `parseImageUrl()` en `src/config/env.ts` acepta URLs absolutas `http(s)://...` o rutas locales que empiecen con `/`. Valores inválidos generan `console.warn` y usan el default.
- **Fallback para imágenes rotas**: todos los `<img>` de productos incluyen `onerror="this.onerror=null;this.src='<%= fallbackImageUrl %>'"` para cubrir URLs 404, no solo `image_url` vacío.

### Relación con el spec

El spec §2.2 permitía servir una imagen fallback estática en `/public`
como alternativa a Cloudinary. Ahora el fallback es una URL
configurable que puede apuntar a cualquier servicio externo o ruta
local.

---

## 7. Estructura de directorios actual (no cubierta en el spec)

El spec describe la estructura esperada pero la realidad del proyecto
evolucionó:

```
src/
├── app.ts                    ← punto de entrada, Express setup
├── config/
│   ├── database.ts           ← SQLite bootstrap + pragmas
│   ├── env.ts                ← configuración tipada de env vars
│   └── swagger.ts            ← configuración OpenAPI
├── controllers/
│   ├── api/                  ← controllers para rutas /api/*
│   │   ├── cart.controller.ts
│   │   ├── category.controller.ts
│   │   ├── order.controller.ts
│   │   └── auth.controller.ts
│   └── pages/                ← controllers para rutas SSR
│       └── pages.controller.ts
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
│   ├── order.service.ts
│   └── promo.service.ts
├── routes/
│   ├── index.routes.ts       ← router API principal
│   ├── pages.routes.ts       ← router de páginas SSR
│   └── api/                  ← sub-routers por recurso
├── models/                   ← interfaces de datos
├── dtos/                     ← Data Transfer Objects
├── utils/                    ← helpers puros (normalizeId, category-icons)
└── views/templates/          ← árbol atómico (atoms, molecules, organisms, pages)
```

---

## 8. Cambios pendientes de documentación

| Cambio | Estado | Notas |
|---|---|---|
| Documentación de `dev.db` en `.gitignore` | Parcial | `dev.db` está en `.gitignore` pero `dev.db-shm` y `dev.db-wal` no |
| Documentación de `scripts/seed.ts` en el spec | Parcial | El spec menciona "seed" pero no el script específico |
| Documentación de `better-sqlite3-session-store` | No cubierto | PR #47, no está en el spec |
| `spectsEccomerce/reestructuracion-views.md` | Documentado por separado | No está integrado en el spec principal |
| Cloudinary eliminado | Resuelto | Reemplazado por `FALLBACK_IMAGE_URL` configurable; ver `documentacion-typedoc.md` |
