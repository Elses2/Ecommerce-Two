# =============================================================================
# Dockerfile para MiEcommerce (spec §21)
# =============================================================================
# Estrategia multi-stage:
#   Stage 1 (builder):  Instala herramientas de compilación (build-essential,
#                        python3) para compilar better-sqlite3 (módulo nativo),
#                        instala TODAS las dependencias (npm ci) y compila la app.
#   Stage 2 (runtime):  Imagen limpia SIN build tools. Copia node_modules ya
#                        compilado + dist/ + src/ (necesario para npm run seed
#                        y npm run test:checkout, que usan tsx e importan de
#                        ../src/...).
#
# Decisión: se mantienen devDeps en runtime (tsx, etc.) porque los scripts
# npm run seed y npm run test:checkout las necesitan y el seed importa del
# árbol fuente. No se podan para mantener funcionalidad sin añadir build tools.
# =============================================================================

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /build

# Instalar herramientas de compilación para módulos nativos (better-sqlite3)
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends \
        build-essential \
        python3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar definiciones de dependencias y cachearlas
COPY package*.json ./
RUN npm ci

# Copiar el resto del árbol fuente y compilar
COPY . .
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

# Copiar componentes desde builder
COPY --from=builder /build/dist        ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/src         ./src
COPY --from=builder /build/scripts     ./scripts
COPY --from=builder /build/public      ./public
COPY --from=builder /build/package*.json ./
COPY --from=builder /build/tsconfig.json ./tsconfig.json

# Crear directorio de datos para el volumen SQLite (spec §16: DB_PATH)
# El directorio completo (no solo el archivo) porque SQLite crea -wal y -shm.
RUN mkdir -p /data && chown node:node /data

# Variables de entorno por defecto (ningún secreto horneado, spec §16)
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/shop.db

# Ejecutar como usuario no root (seguridad)
USER node

EXPOSE 3000

# Comando de arranque en producción: node dist/app.js (spec §0, package.json start)
CMD ["node", "dist/app.js"]