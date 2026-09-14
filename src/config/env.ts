import "dotenv/config";

// Variables de entorno tipadas; valores por defecto solo para desarrollo local
export const env = {
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET ?? "",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    folder: process.env.CLOUDINARY_FOLDER ?? "",
  },
} as const;

// Placeholder genérico que marca una credencial sin configurar
export const PLACEHOLDER_VALUE = "pegar_key_aqui";
