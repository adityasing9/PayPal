import { Router } from 'express';
import {
  getPreferencesController,
  updatePreferencesController
} from '../controllers/preferences.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updatePreferencesSchema } from '../schemas/auth.schema.js';

const router = Router();

router.get('/preferences', requireAuth, getPreferencesController);
router.put('/preferences', requireAuth, requireCsrf, validate(updatePreferencesSchema), updatePreferencesController);

export default router;
