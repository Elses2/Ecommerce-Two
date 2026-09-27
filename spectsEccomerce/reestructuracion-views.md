# Reestructuración de `views/` — raíz → `src/views/templates/`

> Documenta el estado actual de las plantillas EJS, qué se corrigió y qué
> quedó obsoleto. Generado durante el cierre del Sprint 1.

---

## 1. Situación real al detectar el problema

El usuario identificó que `views/` estaba en raíz cuando debería estar dentro de `src/`.
Al investigar, el estado real era:

| Carpeta | ¿Existe en disco? | ¿Trackeada por git? | Estado |
|---|---|---|---|
| `views/` (raíz) | ❌ No | Sí (archivos marcados `D` = borrados de working tree) | Carpeta legacy con árbol plano: `layout.ejs`, `pages/*`, `partials/*`, `templates/*` (contenido duplicado del árbol atómico) |
| `src/views/layout.ejs`, `src/views/pages/*`, `src/views/partials/*` | ❌ No | Sí (marcados `D`) | Árbol legacy simple — borrado en sprint |
| `src/views/templates/` | ✅ Sí | ❌ No (untracked, creado en sprint) | **Árbol atómico actual** — 41 archivos EJS en `{atoms,molecules,organisms,pages}` |
| `dist/views/` | ✅ Sí (rebuild) | No (`dist/` en gitignore) | **Stale legacy** pre-rebuild, ahora regenerado con árbol atómico |

**Conclusión**: el contenido del `views/` de raíz era el mismo árbol atómico
ya existente en `src/views/templates/`. No hacía falta mover nada; la estructura
correcta ya estaba en `src/views/templates/`.

---

## 2. Cambios realizados

### `src/app.ts` — simplificación de view roots

**Antes** (líneas 23 y 52):
```typescript
// Doble set — el segundo sobreescribe al primero
app.set("views", path.join(__dirname, "views"));
// ...
app.set("views", [path.join(process.cwd(), "views"), path.join(__dirname, "views")]);
```

**Problema**: `path.join(process.cwd(), "views")` apuntaba a `/project/views/`
que **no existe en disco**. El multi-root era innecesario porque Express resolvía
correctamente desde `src/views/templates/` vía `__dirname/views`.

**Después** (línea 23):
```typescript
app.set("views", path.join(__dirname, "views"));
```

Un único root: `src/views/` (dev) → `dist/views/` (producción). Las renderizaciones
como `"templates/pages/404"` resuelven a `src/views/templates/pages/404.ejs`
(dev) o `dist/views/templates/pages/404.ejs` (prod). ✅

### `src/routes/pages.routes.ts` — comentario obsoleto eliminado

Se eliminó el comentario que mencionaba multi-root y legacy `src/views/pages/*.ejs`
como código muerto pendiente (ya no existe).

### `src/middlewares/error-handler.middleware.ts` — comentario obsoleto corregido

Se corrigió "multi-root views/templates" → referencia simplificada al árbol atómico.

### `dist/views/` — reconstruido

Se ejecutó `npm run build` para regenerar `dist/views/` con el árbol atómico
actual: `dist/views/templates/{atoms,molecules,organisms,pages}/*.ejs`
(41 archivos). Los 9 archivos legacy stale (`layout.ejs`, `pages/*`, `partials/*`
del build anterior) fueron eliminados.

### `spectsEccomerce/resultado-primer-sprint.md` — correcciones

- Línea 123: se actualizó referencia a "páginas legacy de `src/views/`" → ahora
  dice que fueron reemplazadas por `src/views/templates/`.
- Línea 133 (antes 134): se corrigió "dist/views solo copia el árbol legacy" →
  ahora refleja que el build script ya copia el árbol atómico completo.

---

## 3. Qué NO es obsoleto (no tocar)

| Elemento | Estado |
|---|---|
| `src/views/templates/` | **Activo** — 41 EJS, estructura atómica, referenciados por app.ts |
| `dist/views/templates/` | **Activo** — build reciente, refleja `src/views/templates/` |
| `app.ts` línea 23 | **Activo** — `app.set("views", path.join(__dirname, "views"))` |
| `package.json` build script | **Correcto** — `cpx "src/views/**/*.ejs" dist/views` copia recursivamente |
| `spectsEccomerce/ecommerce-spec-sprint1.md` líneas 40–46 | **Correcto** — el ASCII tree del spec ya muestra `src/views/templates/layout.ejs` + `src/views/{atoms,molecules,organisms,pages}/` |
| `src/views/templates/pages/404.ejs` comentarios sobre `views/pages/404.ejs` | **Informativo** — documenta el path legacy por compatibilidad conceptual, no rompe nada |

---

## 4. Qué SÍ es obsoleto o sobrante

### En disco (limpio)

Nada. El contenido obsoleto ya fue eliminado del working tree:
- `views/` (raíz) — borrado de disco, git todavía lo rastrea como eliminado
- `src/views/layout.ejs`, `src/views/pages/*`, `src/views/partials/*` — borrados de disco

### En git (pendiente de commit)

Para limpiar el historial, hacer:
```bash
git rm -r views/
git rm src/views/layout.ejs src/views/pages/ src/views/partials/
git add src/views/templates/
```
Los archivos marcados `D` en `git status` están en el working tree pero aún
rastreados; necesitan `git rm` para dejar de aparecer.

### En documentación (ya corregido)

- ✅ `spectsEccomerce/resultado-primer-sprint.md` — se corrigieron las dos referencias stale

### No tocar

- `spectsEccomerce/ecommerce-spec-sprint1.md` — las referencias a `views/pages/*`
  y `views/layout.ejs` son parte del spec original (contexto histórico del plan
  antes del árbol atómico). Son documentación de intención, no referencias activas.

---

## 5. Cómo verificar que funciona

```bash
# TypeScript: sin errores de compilación
npx tsc --noEmit

# Build: genera dist/views/templates/ correcto
npm run build

# Verificar que no hay legacy flat files en dist/views
find dist/views -maxdepth 2 -type f ! -path "*/templates/*"
# → no debería devolver nada

# Verificar que dist/views/templates/ tiene contenido
ls dist/views/templates/pages/*.ejs | wc -l
# → 13 páginas
```

---

## 6. Estructura final de vistas

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

Resolución de rutas en Express:
- `res.render("templates/pages/404", {...})` → `src/views/templates/pages/404.ejs` (dev)
- `res.render("templates/pages/404", {...})` → `dist/views/templates/pages/404.ejs` (prod)
