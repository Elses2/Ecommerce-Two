import "dotenv/config";

/**
 * Parsea y valida el puerto provisto en las variables de entorno.
 *
 * @param {string | undefined} rawPort - Valor leído directamente de `process.env.PORT`.
 * @param {number} defaultPort - Puerto de respaldo en caso de que no exista o sea inválido.
 * @returns {number} Número de puerto procesado.
 */
function parsePort(rawPort: string | undefined, defaultPort: number): number {
  const parsed = Number(rawPort);
  return isNaN(parsed) || !rawPort ? defaultPort : parsed;
}

const DEFAULT_FALLBACK_IMAGE_URL =
  "https://placehold.co/600x600?text=Sin+imagen";

/**
 * Acepta URL absoluta `http(s)://...` o ruta local que empiece con `/`.
 * Si el valor no cumple ninguno de esos formatos, emite un warning y
 * devuelve el default.
 *
 * @param {string | undefined} rawValue - Valor de `FALLBACK_IMAGE_URL`.
 * @returns {string} URL de fallback válida.
 */
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

/**
 * Valida y devuelve el secreto de firma de JWT (spec §23.1).
 *
 * En producción un secreto ausente o corto permitiría a cualquiera firmar
 * tokens válidos, así que se falla al arrancar en vez de degradar en silencio.
 * En desarrollo se acepta vacío para no bloquear el arranque.
 *
 * @param {string | undefined} rawValue - Valor de `JWT_SECRET`.
 * @param {boolean} isProduction - `true` si `NODE_ENV === "production"`.
 * @returns {string} Secreto de firma ya validado.
 * @throws {Error} Si en producción falta o tiene menos de 32 caracteres.
 */
function parseJwtSecret(
  rawValue: string | undefined,
  isProduction: boolean,
): string {
  const value = rawValue?.trim() ?? "";
  if (isProduction && value.length < 32) {
    throw new Error(
      "[env] JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres",
    );
  }
  return value;
}

/**
 * Resuelve la URL de Redis (spec §24). En producción es obligatoria; en
 * desarrollo cae a `redis://localhost:6379`.
 *
 * @param {string | undefined} rawValue - Valor de `REDIS_URL`.
 * @param {boolean} isProduction - `true` si `NODE_ENV === "production"`.
 * @returns {string} URL de conexión a Redis.
 * @throws {Error} Si en producción falta `REDIS_URL`.
 */
function parseRedisUrl(
  rawValue: string | undefined,
  isProduction: boolean,
): string {
  const value = rawValue?.trim() ?? "";
  if (!value && isProduction) {
    throw new Error("[env] REDIS_URL es obligatorio en producción");
  }
  return value || "redis://localhost:6379";
}

/**
 * Parsea el flag booleano `COOKIE_SECURE` (spec §16, enmienda §21.5/§21.6).
 *
 * El mismo criterio que `CSP_UPGRADE_INSECURE`: NO depende de `NODE_ENV`;
 * se pone en `true` solo detrás de HTTPS. Acepta `true/1/yes/on` y
 * `false/0/no/off`; un valor inválido emite un warning y cae a `false` para
 * no romper el arranque en HTTP.
 *
 * @param {string | undefined} rawValue - Valor de `COOKIE_SECURE`.
 * @param {boolean} isProduction - `true` si `NODE_ENV === "production"`.
 * @returns {boolean} `true` solo si el valor parseado es verdadero.
 */
function parseCookieSecure(
  rawValue: string | undefined,
  isProduction: boolean,
): boolean {
  const value = rawValue?.trim().toLowerCase() ?? "";
  if (value === "" ) return false;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  console.warn(
    "[env] COOKIE_SECURE inválida, usando false. " +
      (isProduction
        ? "Recordá: detrás de HTTPS activá COOKIE_SECURE=true junto a CSP_UPGRADE_INSECURE=true."
        : "COOKIE_SECURE=true solo detrás de HTTPS."),
  );
  return false;
}

/**
 * Construye el objeto de configuración tipado a partir del entorno global.
 *
 * @param {NodeJS.ProcessEnv} envVars - Objeto global de variables de entorno (`process.env`).
 * @returns {Object} Objeto de configuración global inmutable.
 */
function createEnvConfig(envVars: NodeJS.ProcessEnv) {
  const isProduction = envVars.NODE_ENV === "production";
  return {
    port: parsePort(envVars.PORT, 3000),
    jwtSecret: parseJwtSecret(envVars.JWT_SECRET, isProduction),
    jwtExpiresIn: envVars.JWT_EXPIRES_IN?.trim() || "2h",
    redisUrl: parseRedisUrl(envVars.REDIS_URL, isProduction),
    cookieSecure: parseCookieSecure(envVars.COOKIE_SECURE, isProduction),
    images: {
      fallbackUrl: parseImageUrl(envVars.FALLBACK_IMAGE_URL),
    },
  } as const;
}

// Variables de entorno tipadas; valores por defecto solo para desarrollo local
/**
 * Objeto de configuración principal del sistema cargado desde las variables de entorno (.env).
 */
export const env = createEnvConfig(process.env);
