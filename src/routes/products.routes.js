import { Router } from 'express';
import {
  listProductsController,
  getProductByIdController
} from '../controllers/products.controller.js';

const router = Router();

router.get('/', listProductsController);
router.get('/:id', getProductByIdController);

export default router;
