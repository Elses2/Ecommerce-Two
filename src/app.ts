import path from 'path';
import express, { type Express } from 'express';

const PORT: number = 3000;
const HOST: string = '0.0.0.0';

const app: Express = express();

// Apuntamos 'views' directamente a 'src/views/pages'
app.set('views', path.join(import.meta.dirname, 'views', 'pages'));
app.set('view engine', 'ejs');

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Listado global de categorías
const categories = [
    { id: 'electronica', name: 'Electrónica', icon: '💻' },
    { id: 'alimentos', name: 'Alimentos', icon: '🍎' },
    { id: 'bebidas', name: 'Bebidas', icon: '🥤' },
    { id: 'indumentaria', name: 'Indumentaria', icon: '👕' },
    { id: 'juegos', name: 'Juegos', icon: '🎮' },
    { id: 'automotor', name: 'Automotor', icon: '🚗' },
    { id: 'hogar', name: 'Hogar', icon: '🏠' },
    { id: 'otros', name: 'Otros', icon: '📦' },
];

// Listado de productos destacados (ProductHero)
const heroProducts = [
    {
        id: 101,
        title: 'Auriculares Premium Wireless',
        description: 'Cancelación de ruido activa y batería de 30 horas.',
        points: 15000,
        imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80'
    },
    {
        id: 102,
        title: 'Smartwatch Sport Edition',
        description: 'Monitoreo de salud continuo y GPS integrado.',
        points: 22000,
        imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80'
    }
];

// Listado general de productos
const products = [
    { id: 1, title: 'Teclado Mecánico RGB', points: 4500, imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&q=80' },
    { id: 2, title: 'Mochila Urbana Impermeable', points: 3200, imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80' },
    { id: 3, title: 'Botella Térmica Stainless Steel', points: 1800, imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&q=80' },
    { id: 4, title: 'Silla Gamer Ergonómica', points: 38000, imageUrl: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&q=80' }
];

// 1. Página de Inicio (ahora renderiza 'index')
app.get('/', (req, res) => {
    res.render('index', { categories, heroProducts, products });
});

// 2. Página de Login
app.get('/login', (req, res) => {
    res.render('login');
});

// Procesar Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Usuario:', username, 'Contraseña:', password);
    res.redirect('/');
});

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});