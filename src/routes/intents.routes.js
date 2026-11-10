import { Router } from 'express';
import {
  createIntentController,
  getIntentsController,
  getIntentByIdController
} from '../controllers/intents.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createIntentSchema } from '../schemas/intent.schema.js';

const router = Router();

router.post('/', requireAuth, requireCsrf, validate(createIntentSchema), createIntentController);
router.get('/', requireAuth, getIntentsController);
router.get('/:id', requireAuth, getIntentByIdController);

export default router;
