import { Router } from "express";
import categoriesRoutes from "./api/categories.routes.js";
import productsRoutes from "./api/products.routes.js";
import cartRoutes from "./api/cart.routes.js";
import ordersRoutes from "./api/orders.routes.js";
import authRoutes from "./api/auth.routes.js";

const router = Router();

router.use("/categories", categoriesRoutes);
router.use("/products", productsRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", ordersRoutes);
router.use("/auth", authRoutes);

export default router;
