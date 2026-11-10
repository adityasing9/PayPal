import { Router } from 'express';
import { verifyProposalController } from '../controllers/security.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { verifyProposalSchema } from '../schemas/security.schema.js';

const router = Router();

router.post('/verify', requireAuth, validate(verifyProposalSchema), verifyProposalController);

export default router;
