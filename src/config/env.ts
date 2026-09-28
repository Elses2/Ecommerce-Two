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

/**
 * Obtiene el valor de una variable de entorno de texto, asegurando una cadena vacía por defecto.
 *
 * @param {string | undefined} rawValue - Valor de la variable de entorno.
 * @returns {string} Texto leído de la variable o `""` si es indeifnido.
 */
function getEnvString(rawValue: string | undefined): string {
  return rawValue ?? "";
}

/**
 * Construye el objeto de configuración tipado a partir del entorno global.
 *
 * @param {NodeJS.ProcessEnv} envVars - Objeto global de variables de entorno (`process.env`).
 * @returns {Object} Objeto de configuración global inmutable.
 */
function createEnvConfig(envVars: NodeJS.ProcessEnv) {
  return {
    port: parsePort(envVars.PORT, 3000),
    sessionSecret: getEnvString(envVars.SESSION_SECRET),
    cloudinary: {
      cloudName: getEnvString(envVars.CLOUDINARY_CLOUD_NAME),
      apiKey: getEnvString(envVars.CLOUDINARY_API_KEY),
      apiSecret: getEnvString(envVars.CLOUDINARY_API_SECRET),
      folder: getEnvString(envVars.CLOUDINARY_FOLDER),
    },
  } as const;
}

// Variables de entorno tipadas; valores por defecto solo para desarrollo local
/**
 * Objeto de configuración principal del sistema cargado desde las variables de entorno (.env).
 */
export const env = createEnvConfig(process.env);

// Placeholder genérico que marca una credencial sin configurar
/**
 * Cadena placeholder genérica para identificar credenciales que aún no han sido configuradas.
 */
export const PLACEHOLDER_VALUE = "pegar_key_aqui";