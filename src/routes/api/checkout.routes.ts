import { Router } from "express";
import { checkoutApiController } from "../../controllers/api/checkout.controller.js";
import { authenticate } from "../../middlewares/route/authenticate.middleware.js";

/**
 * @fileoverview Router de la API del checkout (spec §19/§24). Ambas rutas
 * exigen JWT: el carrito y la orden pertenecen al usuario del token.
 */
const router = Router();

router.use(authenticate);

router.get("/", checkoutApiController.showCheckout);
router.post("/", checkoutApiController.submitCheckout);

export default router;
