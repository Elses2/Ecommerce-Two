import path from 'path';
import express, { type Express } from 'express';
import homeRouter from './controllers/home.controller.js';
import loginRouter from './controllers/login.controller.js';
import registerRouter from './controllers/register.controller.js';
import productsRouter from './controllers/products.controller.js';
import checkoutRouter from './controllers/checkout.controller.js';
import cartRouter from './controllers/cart.controller.js';

const PORT: number = 3000;
const HOST: string = '0.0.0.0';

const app: Express = express();

app.set('views', path.join(import.meta.dirname, 'views'));
app.set('view engine', 'ejs');

// TODO: move to routes/index.ts
app.use('/', homeRouter);
app.use('/login', loginRouter);
app.use('/register', registerRouter);
app.use('/products', productsRouter);
app.use('/cart', cartRouter);
app.use('/chekout', checkoutRouter);

app.listen(PORT, HOST, () => {
  console.log('Start server');
});
