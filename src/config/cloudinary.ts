import { v2 as cloudinary } from "cloudinary";
import { env, PLACEHOLDER_VALUE } from "./env.js";

/**
 * Verifica si las credenciales de Cloudinary son válidas y no contienen valores por defecto o vacíos.
 *
 * @param {Object} config - Objeto con la configuración de Cloudinary del entorno.
 * @param {string} config.cloudName - Nombre del cloud de Cloudinary.
 * @param {string} config.apiKey - API Key de Cloudinary.
 * @param {string} config.apiSecret - API Secret de Cloudinary.
 * @param {string} config.folder - Carpeta destino para la subida de archivos.
 * @param {string} placeholder - Valor por defecto/placeholder para validar si el entorno está offline.
 * @returns {boolean} Retorna `true` si todas las credenciales son reales y válidas; `false` en caso contrario.
 */
function checkIsCloudinaryConfigured(config, placeholder) {
  return (
    config.cloudName !== placeholder &&
    config.apiKey !== placeholder &&
    config.apiSecret !== placeholder &&
    config.folder !== placeholder &&
    config.cloudName !== "" &&
    config.apiKey !== "" &&
    config.apiSecret !== ""
  );
}

/**
 * Indica si el servicio de Cloudinary se encuentra configurado con credenciales reales.
 * Si es `false`, la aplicación opera en modo offline con fallback local.
 * 
 * @type {boolean}
 */
const isCloudinaryConfigured = checkIsCloudinaryConfigured(
  env.cloudinary,
  PLACEHOLDER_VALUE
);

/**
 * Configura la SDK global de Cloudinary en modo seguro si la configuración es válida.
 *
 * @param {Object} config - Configuración del entorno.
 * @param {string} config.cloudName - Nombre del cloud.
 * @param {string} config.apiKey - API Key.
 * @param {string} config.apiSecret - API Secret.
 * @returns {typeof cloudinary | null} Retorna la instancia de Cloudinary configurada o `null` si está desactivada.
 */
function configureCloudinary(config) {
  if (!isCloudinaryConfigured) return null;

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  return cloudinary;
}

// Inicializamos la configuración de Cloudinary
configureCloudinary(env.cloudinary);

/**
 * Instancia del SDK de Cloudinary (v2) configurada y lista para usarse.
 */
export { cloudinary };

/**
 * Estado que indica si Cloudinary está listo para ser utilizado en el proyecto.
 */
export { isCloudinaryConfigured };