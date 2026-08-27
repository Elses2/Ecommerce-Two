import { Router } from 'express';

const productsRouter = Router();

productsRouter.get('/', (_req, res) => {
  res.send('products');
});

export default productsRouter;
