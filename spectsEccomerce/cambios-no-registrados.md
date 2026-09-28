# Cambios no registrados en el spec

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
| Dependencias swagger-jsdoc + swagger-ui-express instaladas | #56 | Mergeado a dev |
| Persistencia de sesión en SQLite (better-sqlite3-session-store) | #47 | Mergeado a dev |
| Reestructuración de views (legacy → árbol atómico) | #51 | Mergeado a dev |
| .gitattributes con normalización EOL | #56 | Mergeado a dev |
| Script de seed idempotente (`scripts/seed.ts`) | #29 | Mergeado a dev |
| Imagen fallback (`public/img/fallback.png`) | #29 | Mergeado a dev |

---

## 1. swagger-jsdoc + swagger-ui-express (PR #56)

### Qué pasó

- `swagger-jsdoc` (`^6.2.8`) y `swagger-ui-express` (`^5.0.1`) fueron
  agregados a `package.json` como dependencias.
- Los tipos `@types/swagger-jsdoc` y `@types/swagger-ui-express` también
  fueron instalados.
- **NO hay configuración de Swagger implementada aún.** No existe ningún
  archivo de configuración swagger, no hay definición de OpenAPI spec,
  y no hay ninguna ruta que exponga `/api-docs` o similar.
- PR #56 solo agregó **comentarios JSDoc** a los archivos TypeScript
  (no confundir con documentación Swagger/OpenAPI).

### Qué falta para tener Swagger funcional

1. Crear un archivo de configuración swagger (ej. `src/config/swagger.ts`)
   con la definición de OpenAPI (info, version, rutas, formato de los
   esquemas).
2. Montar `swagger-ui-express` en `app.ts` para servir la UI interactiva.
3. Agregar JSDoc annotations con formato swagger-jsdoc (`@swagger`) a los
   controllers para que el spec se genere automáticamente.
4. Decidir si la documentación Swagger es pública o protegida (auth).

### Nota para la IA de desarrollo

 swagger-jsdoc **está instalado pero no configurado**. Si se va a
 implementar Swagger, el trabajo es de setup + configuración + annotations,
 no de instalar dependencias.

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

## 6. Imagen fallback (`public/img/fallback.png`)

### Qué pasó

Se agregó `public/img/fallback.png` como imagen de respaldo cuando un
producto no tiene `image_url` configurada (spec §2.3). Es un PNG de 0
bytes (placeholder) que se sirve como estática en `/img/fallback.png`.

### Relación con el spec

El spec §2.2 permite explícitamente servir una imagen fallback estática
en `/public` como alternativa a Cloudinary.

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
│   └── cloudinary.ts         ← configuración de Cloudinary
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
| Configuración Swagger completa | **Pendiente** | Dependencias instaladas, falta setup |
| Documentación de `dev.db` en `.gitignore` | Parcial | `dev.db` está en `.gitignore` pero `dev.db-shm` y `dev.db-wal` no |
| Documentación de `scripts/seed.ts` en el spec | Parcial | El spec menciona "seed" pero no el script específico |
| Documentación de `better-sqlite3-session-store` | No cubierto | PR #47, no está en el spec |
| `spectsEccomerce/reestructuracion-views.md` | Documentado por separado | No está integrado en el spec principal |
