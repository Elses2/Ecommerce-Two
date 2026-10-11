import { Router } from "express";
import { orderController } from "../../controllers/api/order.controller.js";
import { authenticate } from "../../middlewares/route/authenticate.middleware.js";
import { validateId } from "../../middlewares/route/validate-id.middleware.js";

/**
 * @fileoverview Router de la API de órdenes (spec §23.6). A diferencia de
 * products/categories (sin rutas), órdenes ya tiene endpoints reales, así que
 * valida su `:id` por ruta con `validateId` en lugar del guard de colecciones.
 *
 * `validateId` va antes de `authenticate` para conservar el comportamiento
 * heredado: un id malformado responde 400 aunque falte el token (el antiguo
 * guard de `/api/orders/:segmento` hacía lo mismo).
 */
const router = Router();

router.get("/", authenticate, orderController.list);
router.get("/:id", validateId("id"), authenticate, orderController.getById);

export default router;
