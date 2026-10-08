# Proyecto Ecommerce-Two

Proyecto desarrollado para la asignatura de **Programación Web** de la **Universidad Nacional de Villa Mercedes (UNVIME)**.

## Acerca del proyecto

Este es un ecommerce sencillo inspirado en Mercado Libre, desarrollado como trabajo práctico de la materia.

### Equipo de desarrollo

**Estudiantes:**

- Martín Mozainer
- Eber Chiecher
- Rocío Pereyra

### Docentes

- **Profesor Titular:** Walter Molina
- **Profesor de Práctica:** []

## Vista del proyecto

### Landing Page

![Landing Page](./assets/images/landingPage.png)

Diseños no propios, dados como recursos en la clase.

## Tecnologías utilizadas

- HTML5
- Tailwind CSS
- TypeScript
- CSS
- SQLite
- Express
- EJS

## Requisitos previos

Antes de instalar el proyecto, asegurate de tener instalado en tu sistema:

- **Node.js** versión **22.0 o superior**. Podés verificar tu versión con:
  
  ```bash
  node -v
  ```
  
  Si no la tenés o tenés una versión anterior, descargala desde [nodejs.org](https://nodejs.org).

- **Python 3.x** (necesario únicamente para compilar dependencias nativas).
  Este proyecto usa `better-sqlite3`, un módulo que en algunos sistemas necesita compilarse localmente mediante `node-gyp`, y esa herramienta requiere Python instalado para funcionar. Si al correr `npm install` aparece un error relacionado con `gyp` o `node-gyp`, instalá Python desde [python.org](https://python.org) (marcando la opción **"Add python.exe to PATH"** durante la instalación) y volvé a intentar.
  
  En Windows, además de Python puede ser necesario instalar las **Build Tools de C++**:
  
  - Descargalas desde [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - Durante la instalación, seleccioná el workload **"Desktop development with C++"**

## Instalación

1. Clona el repositorio

```bash
git clone https://github.com/Elses2/Ecommerce-Two
```

2. Entra en la carpeta del proyecto

```bash
cd Ecommerce-Two
```

3. Prepará el entorno completo con un solo comando

```bash
npm run init
```

Este comando instala las dependencias, crea el archivo `.env` desde `.env.example` **solo si no existe** (no sobrescribe uno ya existente), compila el build y carga los datos de ejemplo (el seed es idempotente).

> Si `npm run init` falla por errores de compilación (por ejemplo, relacionados con `better-sqlite3` o `node-gyp`), revisá la sección [Requisitos previos](#requisitos-previos).

4. Completá tus variables de entorno (opcional)

`npm run init` te deja el archivo `.env` creado en la raíz, listo para editar.

> Ya no hay claves externas que pedir: `SESSION_SECRET` generala con un valor aleatorio largo (por ejemplo, la salida de `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) y no la compartas públicamente. `FALLBACK_IMAGE_URL` puede dejarse con el valor por defecto.

5. Inicia el servidor de desarrollo

```bash
npm run dev
```

6. Ver página

```
http://localhost:3000
```

La documentación interactiva de la API (Swagger UI) queda disponible en `http://localhost:3000/api-docs`.

### Build de producción

`npm run init` ya ejecuta el build de producción, así que no hace falta correrlo durante la instalación. Solo hace falta correrlo a mano para regenerar `dist/` tras un cambio:

```bash
npm run build
```

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run init` | Prepara el entorno completo (deps + `.env` + build + seed) |
| `npm run dev` | Servidor de desarrollo (`tsx watch` + Tailwind watch) |
| `npm run build` | Compilación de producción a `dist/` |
| `npm run seed` | Carga los datos de ejemplo (idempotente) |
| `npm run test:checkout` | Tests del checkout T1–T7 (DB temporal) |
| `npm run build:docs` | Regenera `docs/` (TypeDoc + grafo, requiere Graphviz) |

## Tests

```bash
npm run test:checkout
```

Corre los tests del checkout (`scripts/test-checkout.ts`, casos T1–T7: stock,
rollback, idempotencia por token, precio congelado, carrera multi-proceso y
validación) contra una **DB temporal** — nunca toca `dev.db`. El exit code es
≠ 0 si algo falla.

## Documentación

- [`spectsEccomerce/SPEC.md`](./spectsEccomerce/SPEC.md) es la **especificación viva**: describe el proyecto tal como es hoy y es la única fuente de verdad que se edita. El resto de los `.md` en `spectsEccomerce/` son históricos y no se actualizan. Las referencias `(spec §X.Y)` de los comentarios del código apuntan a `SPEC.md`.
- `npm run build:docs` regenera la documentación en `docs/` (carpeta versionada en git): el HTML de TypeDoc (según `scripts/typedoc.json`) y el grafo de dependencias `docs/graphs/dependencias.svg` (madge). Requiere Graphviz instalado en el sistema. Si cambió la arquitectura, commitear el resultado.
