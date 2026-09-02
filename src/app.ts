import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";

// Truco para tener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACIÓN DE EJS Y LAYOUTS
// ==========================================
//app.use(expressLayouts);          despues decomentar
app.set("view engine", "ejs");
// Le decimos que la carpeta de vistas es /src/views
app.set("views", path.join(__dirname, "views"));
// Por defecto, express-ejs-layouts buscará un archivo llamado 'layout.ejs' en la raíz de 'views'
// app.set("layout", "layout");     despues descomentar

// Carpeta de archivos estáticos (Acá irá el CSS compilado de Tailwind)
app.use(express.static(path.join(__dirname, "../dist/public")));

// ==========================================
// RUTAS (Sprint 1 - Sin Express Router por ahora)
// ==========================================

// 🏠 Página de Inicio
app.get("/", (req, res) => {
  res.render("pages/index", { title: "Inicio" });
});

// 📦 Página de un producto en particular
app.get("/products", (req, res) => {
  res.render("pages/products", { title: "Producto" });
});

// 🛒 Página del carrito (Esta es la que vas a probar ahora)
app.get("/cart", (req, res) => {
  res.render("pages/cart", { title: "Carrito de Compras" });
});

// 💵 Página de pago
app.get("/checkout", (req, res) => {
  res.render("pages/checkout", { title: "Pago" });
});

// ➕ Página de registro
app.get("/register", (req, res) => {
  res.render("pages/register", { title: "Crear Cuenta" });
});

// 🔑 Página de inicio de sesión
app.get("/login", (req, res) => {
  res.render("pages/login", { title: "Iniciar Sesión" });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🛒 Probá tu carrito en: http://localhost:${PORT}/cart`);
});
