import { Router } from "express";
import categoriesRoutes from "./api/categories.routes";
import productsRoutes from "./api/products.routes";
import cartRoutes from "./api/cart.routes";
import ordersRoutes from "./api/orders.routes";
import authRoutes from "./api/auth.routes";

const router = Router();

router.use("/categories", categoriesRoutes);
router.use("/products", productsRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", ordersRoutes);
router.use("/auth", authRoutes);

export default router;
