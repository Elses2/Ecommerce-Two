import { Router } from "express";
import { cartController } from "../../controllers/api/cart.controller.js";

// Rutas del carrito (spec §6.4): acciones que modifican la sesión van bajo
// /api/cart/*; el GET /cart (render inicial) sigue en pages.routes.
const router = Router();

router.post("/add/:productId", cartController.addItem);
router.patch("/increase/:productId", cartController.increaseItem);
router.patch("/decrease/:productId", cartController.decreaseItem);
router.delete("/remove/:productId", cartController.removeItem);
router.delete("/clear", cartController.clearCart);

export default router;
