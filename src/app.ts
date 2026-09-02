import express from "express";
import path from "path";
import pagesRoutes from "./routes/pages.routes";
import apiRoutes from "./routes/index.routes";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";

// Truquito con url para que funconen bien los path: re molesto, hay una forma mas moderna y corta de hacerlo pero lo dejo asi para mas claridad
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Configuración de vistas ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "../public")));

// --- Middlewares globales ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Activamos el sistema de layouts
app.use(expressLayouts);
app.set("layout", "layout"); // busca views/layout.ejs por defecto

// --- Routers (acá usamos imports relativos, sin `path`) ---
app.use("/", pagesRoutes); // Frontend: /, /products, /cart, /login, etc.
app.use("/api", apiRoutes); // Backend: /api/products, /api/categories, etc.

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));

export default app;
