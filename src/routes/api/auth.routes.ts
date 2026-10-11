import { Router } from "express";
import { authController } from "../../controllers/api/auth.controller.js";
import { authenticate } from "../../middlewares/route/authenticate.middleware.js";

/**
 * @fileoverview Router de la API de autenticación (spec §23.2). Se monta bajo
 * `/api/auth` desde `routes/index.routes.ts`. `GET /me` va protegido por el
 * middleware de ruta `authenticate` (spec §22.3/§23.3).
 */
const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authenticate, authController.me);

export default router;
