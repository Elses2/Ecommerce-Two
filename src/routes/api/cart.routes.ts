import { Router } from "express";
import { cartController } from "../../controllers/api/cart.controller.js";
import { validateId } from "../../middlewares/route/validate-id.middleware.js";

// Rutas del carrito (spec §6.4): acciones que modifican la sesión van bajo
// /api/cart/*; el GET /cart (render inicial) sigue en pages.routes.
const router = Router();

// Validación de ids encadenada (spec §6.9): mismo predicado y mismo 400 que la
// validación del controller, que se mantiene como defensa en profundidad.
router.post("/add/:productId", validateId("productId"), cartController.addItem);
router.patch("/increase/:productId", validateId("productId"), cartController.increaseItem);
router.patch("/decrease/:productId", validateId("productId"), cartController.decreaseItem);
router.delete("/remove/:productId", validateId("productId"), cartController.removeItem);
router.delete("/clear", cartController.clearCart);

export default router;
