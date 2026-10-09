# PROMPT BASE — Flujo de trabajo para cada cambio del proyecto

> Este documento define **cómo debes trabajar cada vez que te pido agregar,
> modificar o eliminar una funcionalidad**. Es obligatorio seguirlo completo,
> en orden, sin saltarte pasos. Si algo no se puede cumplir, me lo dices antes
> de continuar.

---

## 0. Mi pedido

> Reemplazar este bloque en cada prompt:

**Tipo de cambio:** `agregar` | `modificar` | `eliminar`
**Descripción:** <qué quiero que hagas>
**Issue existente (si hay):** `#<número>` o "no hay, créalo"

---

## 1. Antes de tocar código

1. Lee `spectsEccomerce/SPEC.md` completo. Es la **única fuente de verdad viva**.
   Los demás `.md` de `spectsEccomerce/` son históricos: **no se editan ni se
   usan como referencia de implementación**.
2. Identifica qué secciones `§` de la SPEC se ven afectadas por el pedido.
3. Respeta siempre las reglas de arquitectura de `SPEC §0`:
   - **Controller** orquesta; sin lógica de negocio ni queries.
   - **Service** lógica de negocio pura; no conoce Express ni SQL.
   - **Repository** único lugar que accede a datos (SQLite, `better-sqlite3`).
   - **Model** solo interfaces; **DTO** forma de entrada/salida de un endpoint.
   - **Atoms/Molecules** sin datos reales; **Organisms** pueden recibirlos del controller.
   - `routes/api/*` solo para AJAX real; el resto usa `res.render` / `res.redirect`.
4. Si el pedido es ambiguo o contradice la SPEC, **pregúntame antes de implementar**.

---

## 2. Gitflow: issue → rama → commits → PR a `dev`

### 2.1 Issue

- Si no existe, créalo (`gh issue create`) con:
  - **Título** claro, en español, con la misma convención de tipos (ej. `feat: agregar filtro por categoría`).
  - **Descripción:** contexto, objetivo, criterios de aceptación y secciones de la SPEC afectadas.
  - **Labels** acordes (`enhancement`, `bug`, `documentation`, `refactor`, etc.).
- Si ya existe, úsalo y no crees uno nuevo.

### 2.2 Rama

- Parte siempre desde `dev` actualizado (`git checkout dev && git pull`).
- Nombre de rama: `<tipo>/<n-issue>-<descripcion-corta-en-kebab-case>`
  - Ejemplos: `feat/80-filtro-por-categoria`, `fix/81-desbordamiento-vista-movil`, `docs/82-actualizar-spec`.
- **Nunca** hagas commit ni push directo a `dev` o `main`.

### 2.3 Commits (Conventional Commits, en español)

Formato: `<tipo>: <descripción en minúscula, en infinitivo, clara y específica>`

| Tipo | Cuándo usarlo | Ejemplo |
|---|---|---|
| `feat` | Nueva funcionalidad | `feat: agregar sistema de login de usuarios` |
| `fix` | Corrección de un error o bug | `fix: resolver caída al procesar contraseñas vacías` |
| `refactor` | Cambio de código que no agrega funcionalidad ni arregla bugs, pero mejora la estructura | `refactor: optimizar consulta a la base de datos` |
| `chore` | Mantenimiento, dependencias, configuraciones | `chore: actualizar versión de dependencias` |
| `docs` | Cambios exclusivos de documentación (SPEC, README, comentarios, `docs/`) | `docs: actualizar instrucciones de instalación` |
| `style` | Formato (espacios, punto y coma) sin afectar la lógica | `style: corregir indentación en el controlador` |
| `test` | Agregar o corregir pruebas | `test: agregar pruebas para validación de email` |

Reglas:

- ❌ Mal: `arregle la cosa de la pantalla que se rompia`
- ✅ Bien: `fix: corregir desbordamiento de texto en la vista móvil`
- **Commits pequeños y atómicos:** un commit = una idea. No mezcles código y
  documentación generada en el mismo commit.
- Orden sugerido: commits de código (`feat`/`fix`/`refactor`) → `test` →
  `docs` (SPEC) → `docs` (README) → `docs` (regeneración de `docs/`).
- Referencia el issue en el cuerpo del commit cuando aporte contexto (`Refs #N`).

### 2.4 Pull Request

- **Base:** `dev`. **Compare:** tu rama.
- **Debe asociarse al issue** con `Closes #N` (o `Fixes #N`) en la descripción.
- **Título:** misma convención de commits (`feat: agregar filtro por categoría`).
- **Descripción obligatoria** (usa esta plantilla):

```md
## Resumen
<Qué hace este PR en 2–3 líneas>

Closes #<n-issue>

## Tipo de cambio
- [ ] feat  - [ ] fix  - [ ] refactor  - [ ] chore  - [ ] docs  - [ ] style  - [ ] test

## ¿Qué se hizo?
- <cambio 1: archivo/capa + qué hace>
- <cambio 2>
- <cambio 3>

## ¿Por qué?
<Motivación / problema que resuelve>

## Secciones de la SPEC afectadas
- §X.Y — <qué se actualizó>
- Historial de cambios: fila agregada ✅

## Endpoints / Swagger
- <endpoints nuevos o modificados y confirmación de que aparecen en /api-docs>
  (o "No aplica")

## README
- <qué se actualizó en el README> (o "No aplica")

## Documentación generada
- `npm run build:docs` ejecutado y `docs/` incluido en el PR ✅

## Cómo probar
1. <paso>
2. <paso>

## Checklist
- [ ] Commits siguen Conventional Commits
- [ ] Respeta la arquitectura en capas (SPEC §0)
- [ ] JSDoc con `@param`/`@returns` y referencia `(spec §X.Y)`
- [ ] Swagger actualizado (si hay controller/endpoint)
- [ ] SPEC.md actualizada + historial
- [ ] `.env.example` sincronizado (si aplica)
- [ ] README revisado y actualizado (o justificado como "no aplica")
- [ ] `npm run build:docs` ejecutado y commiteado
- [ ] El proyecto compila y arranca sin errores
```

---

## 3. Comentarios en el código

### 3.1 Convención JSDoc (SPEC §18)

- Cada archivo `.ts` nuevo o tocado lleva un comentario de módulo / `@fileoverview`
  arriba, explicando **qué hace y por qué existe**, con referencia a la SPEC.
- Cada función lleva:
  - Explicación breve de lo que hace (el **por qué**, no solo el qué).
  - `@param {Tipo} nombre - descripción`
  - `@returns {Tipo} descripción`
- **Toda referencia a la SPEC usa el formato `(spec §X.Y)`** y apunta a `SPEC.md`,
  nunca a los históricos.
- Los comentarios en `.ejs` son sintaxis JS dentro de `<% %>`; mantenlos
  igualmente claros y con referencia a la SPEC.

Ejemplo de estilo esperado:

```ts
/**
 * @fileoverview Controller de páginas: consolida los handlers de vistas que
 * antes vivían en pages.routes (rutas finas: route → controller). Home según
 * spec §4.1: categorías (bloques 2 y 6), banners (bloque 3, §6.6b),
 * sugeridos (bloque 4, §6.6) y más pedidos (bloque 5, §6.7). Header (1) y
 * footer (7) los aporta templates/layout.ejs.
 */

/**
 * Renderiza la home con todos sus bloques (spec §4.1).
 * @param {Request} req - Request de Express.
 * @param {Response} res - Response de Express; se usa para renderizar la vista.
 * @returns {void}
 */
```

### 3.2 Swagger (SPEC §10)

- **Todo controller/endpoint nuevo o modificado** debe documentarse con un bloque
  `@swagger` (OpenAPI) para que aparezca en `/api-docs`.
- El bloque `@swagger` va **separado** de los `@param` (swagger-jsdoc no lee los `@param`).
- Incluye: ruta, método, descripción, parámetros, body (si hay), respuestas
  (códigos y esquemas) y tags.
- Si se elimina un endpoint, se elimina también su bloque `@swagger`.
- Verifica que `/api-docs` renderiza bien con el cambio.

---

## 4. Actualizar `SPEC.md` (documento vivo)

Sigue la sección "Cómo mantener este documento" de la SPEC:

1. Edita la(s) sección(es) afectada(s) para que describan el proyecto **tal como
   queda después del cambio**. **Nunca renumeres** secciones existentes.
2. Si **agregas** una funcionalidad nueva → crea una sección nueva **al final**
   con la numeración siguiente (`§19`, `§20`, …) y agrégala al **índice**.
3. Si **modificas** → actualiza el contenido y ajusta el estado en el índice si cambió.
4. Si **eliminas** → conserva el número y encabezado de la sección, márcala con
   `> ⚠️ Reemplazado:` (o `Eliminado`) explicando por qué y apuntando al
   histórico/PR; actualiza el estado en el índice.
5. Actualiza **todo lo que se vea tocado** aunque no sea la sección principal:
   árbol de directorios (§14), árbol de views (§15), variables de entorno (§16),
   esquema de BD (§1), contrato `data-*` (§5), checklist de validación (§9), etc.
6. Agrega una fila en **Historial de cambios**: fecha, `PR #N / issue #M`,
   resumen de una línea y detalle histórico (si aplica).
7. Actualiza la línea **"Última actualización"** del encabezado.
8. Crea un `.md` histórico **solo** si el cambio es una decisión grande o con
   contexto valioso; si no, basta la fila del historial.
9. Verifica que **todas las referencias `(spec §X.Y)` del código** que tocaste
   siguen apuntando a la sección correcta. Si una quedó obsoleta, corrígela en
   el código y en la SPEC a la vez.

### Sincronización de archivos relacionados

Si el cambio lo requiere, actualiza también:

- `.env.example` y SPEC §16 (variables de entorno nuevas o eliminadas).
- `README.md` (ver sección 5, es obligatoria su revisión).
- `.gitignore` si aparecen nuevos archivos generados.
- `scripts/` o configuración de typedoc/madge si cambia la estructura.

---

## 5. Actualizar el `README.md` (si es necesario)

El README es la puerta de entrada al proyecto: lo lee alguien que nunca vio el
código. **En cada cambio debes revisarlo y decidir si hay que actualizarlo.**
Si no hace falta, dilo explícitamente en el PR ("README: no aplica").

### 5.1 Cuándo SÍ hay que actualizarlo

| Si el cambio... | Actualiza en el README |
|---|---|
| Agrega, quita o modifica una **funcionalidad visible** | Lista de funcionalidades / características |
| Agrega, quita o renombra **scripts** de `package.json` | Sección de scripts y comandos |
| Agrega o quita **variables de entorno** | Sección de configuración (debe coincidir con `.env.example` y SPEC §16) |
| Agrega o cambia **dependencias o requisitos** (Node, Graphviz, etc.) | Requisitos e instalación |
| Cambia la **estructura de carpetas** relevante | Estructura del proyecto (debe coincidir con SPEC §14) |
| Agrega, quita o cambia **endpoints** | Enlace/mención a `/api-docs` y ejemplos de uso si los hay |
| Cambia cómo **instalar, correr, probar o desplegar** | Instalación, ejecución y despliegue |
| Cambia la **documentación generada** (`docs/`, grafo) | Sección de documentación y cómo regenerarla |

### 5.2 Cómo actualizarlo

1. Lee el README completo antes de editarlo; mantén su estructura y tono.
2. Edita **solo lo afectado**: no reescribas secciones que no cambiaron.
3. Elimina del README todo lo que el cambio dejó obsoleto (comandos, variables,
   funcionalidades quitadas). **Un README desactualizado es peor que uno corto.**
4. Verifica que los comandos y rutas que escribas **funcionan de verdad**
   (ejecútalos o compruébalos).
5. Mantén coherencia con la SPEC: el README resume y enlaza, la SPEC detalla.
   No dupliques contenido largo; enlaza a `spectsEccomerce/SPEC.md` y a
   `/api-docs`.
6. Commit separado: `docs: actualizar README con <qué cambió>`.

### 5.3 Qué debe contener como mínimo (si falta, agrégalo)

- Descripción breve del proyecto y stack.
- Requisitos previos e instalación.
- Variables de entorno (referencia a `.env.example`).
- Scripts disponibles (`dev`, `build`, `build:docs`, seed, etc.).
- Cómo ver la documentación (`/api-docs`, `docs/`, SPEC).
- Estructura general del proyecto.
- Flujo de contribución (gitflow, convención de commits, PR a `dev`).

---

## 6. Documentación generada (SPEC §17)

Al terminar el código y los comentarios:

1. Ejecuta `npm run build:docs` (TypeDoc + grafo de dependencias con madge;
   requiere Graphviz instalado).
2. Verifica que se regeneraron `docs/` y `docs/graphs/dependencias.svg` sin errores.
3. **Commitea el resultado** en la misma rama con un commit `docs: regenerar documentación typedoc y grafo de dependencias`.
4. Debe quedar incluido en el PR a `dev`.

---

## 7. Validación antes de abrir el PR

- [ ] El proyecto compila (`npm run build`) y arranca sin errores.
- [ ] La funcionalidad pedida funciona y no rompe lo existente (checklist SPEC §9).
- [ ] Arquitectura en capas respetada; sin lógica de negocio en controllers.
- [ ] JSDoc completo (`@fileoverview`, `@param`, `@returns`, `(spec §X.Y)`).
- [ ] Swagger actualizado y visible en `/api-docs` (si aplica).
- [ ] `SPEC.md`: secciones, índice, historial y fecha actualizados.
- [ ] `.env.example` sincronizado (si aplica).
- [ ] `README.md` revisado y actualizado, o indicado como "no aplica" en el PR.
- [ ] `npm run build:docs` ejecutado; `docs/` commiteado.
- [ ] Todos los commits siguen la convención; ninguno directo a `dev`/`main`.

### 7.1 Regla de actualización del CI (para agentes)

Cuando un agente (IA, orquestador, asistente) cree **tests o scripts de
verificación nuevos** y los considere pertinentes para la ejecución
automatizada en CI, debe:

1. Añadir el nuevo script al job `ci` de `.github/workflows/ci-cd.yml`.
2. Documentar la inclusión en la sección **§21 (CI/CD y despliegue)** de
   `spectsEccomerce/SPEC.md`.
3. Si el script requiere dependencias o configuraciones especiales en CI,
   detallarlas en el propio workflow como comentario y en la SPEC.

**Razón:** El pipeline de CI debe mantenerse sincronizado con la batería de
tests del proyecto. Cada vez que se agrega una verificación significativa
(test de regresión, validación de esquema, lint, type-check), debe ejecutarse
automáticamente en cada push para detectar regresiones temprano.

> *Nota: hoy el CI solo ejecuta `npm run build` y `npm run test:checkout`.*
> *Está diseñado para crecer orgánicamente con el proyecto.*

---

## 8. Entrega final

Al terminar, respóndeme con:

1. Link al **issue** y al **PR** (base `dev`).
2. Resumen de lo hecho (el mismo que va en el PR).
3. Lista de secciones de la SPEC modificadas y si se actualizó el README (qué cambió o por qué no aplica).
4. Lista de commits creados.
5. Cualquier decisión que tomaste por tu cuenta, supuestos, o cosas pendientes
   que detectaste (sin implementarlas fuera de alcance).

**No hagas merge del PR:** lo reviso y lo apruebo yo.

---

## Reglas generales

- Todo en **español** (issues, PRs, commits, comentarios), salvo nombres de código.
- **No hagas cambios fuera del alcance del pedido.** Si ves algo que mejorar,
  repórtalo en la entrega final o propón un issue aparte.
- Ante la duda, pregunta antes de asumir.
