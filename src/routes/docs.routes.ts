import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import spec from "../config/swagger.js";

/**
 * @fileoverview Router de Swagger UI (`/api-docs`, spec §10).
 *
 * Swagger UI usa scripts y estilos inline, así que se relaja el CSP **solo** en
 * este router (el resto de la app conserva el CSP estricto de `baseMiddlewares`).
 */
const router = Router();

router.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
  next();
});

router.use("/", swaggerUi.serve, swaggerUi.setup(spec));

export default router;
