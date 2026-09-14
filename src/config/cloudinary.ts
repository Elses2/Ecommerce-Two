import { v2 as cloudinary } from "cloudinary";
import { env, PLACEHOLDER_VALUE } from "./env.js";

// Config guardada (D7): solo se configura Cloudinary cuando las credenciales
// son reales; con placeholders la app funciona offline con fallback local.
const isCloudinaryConfigured =
  env.cloudinary.cloudName !== PLACEHOLDER_VALUE &&
  env.cloudinary.apiKey !== PLACEHOLDER_VALUE &&
  env.cloudinary.apiSecret !== PLACEHOLDER_VALUE &&
  env.cloudinary.folder !== PLACEHOLDER_VALUE &&
  env.cloudinary.cloudName !== "" &&
  env.cloudinary.apiKey !== "" &&
  env.cloudinary.apiSecret !== "";

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

export { cloudinary, isCloudinaryConfigured };
