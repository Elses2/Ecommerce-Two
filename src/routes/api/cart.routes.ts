import { Router } from "express";
import { cartController } from "../../controllers/api/cart.controller.js";
import { authenticate } from "../../middlewares/route/authenticate.middleware.js";
import { validateId } from "../../middlewares/route/validate-id.middleware.js";

/**
 * @fileoverview Router de la API del carrito (spec §6.4/§24). Todas las rutas
 * exigen JWT: la clave del carrito en Redis es el `userId` del token, así que
 * `authenticate` va antes de validar el id (rechazar sin token primero).
 */
const router = Router();

router.use(authenticate);

router.get("/", cartController.getCart);
router.post("/add/:productId", validateId("productId"), cartController.addItem);
router.patch(
  "/increase/:productId",
  validateId("productId"),
  cartController.increaseItem,
);
router.patch(
  "/decrease/:productId",
  validateId("productId"),
  cartController.decreaseItem,
);
router.delete(
  "/remove/:productId",
  validateId("productId"),
  cartController.removeItem,
);
router.delete("/clear", cartController.clearCart);

export default router;
