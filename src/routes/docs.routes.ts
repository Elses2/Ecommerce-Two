import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import spec from "../config/swagger.js";

const router = Router();

router.use("/", swaggerUi.serve, swaggerUi.setup(spec));

export default router;
