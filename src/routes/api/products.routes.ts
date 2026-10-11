import { Router } from "express";
import { validateCollectionId } from "../../middlewares/route/validate-id.middleware.js";

/**
 * @fileoverview Router de la API de productos. Sin endpoints reales todavía
 * (scaffold del spec §14); mantiene el guard de ids (spec §6.9) que antes era
 * global en `app.ts`.
 */
const router = Router();

// Guard de ids (spec §6.9): preserva el comportamiento del antiguo middleware
// global sobre /api/products/:segmento (ver validate-id.middleware.ts, #91).
router.use(validateCollectionId);

export default router;
