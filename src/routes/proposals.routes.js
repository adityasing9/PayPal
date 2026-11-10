import { Router } from 'express';
import {
  createProposalController,
  getProposalByIdController
} from '../controllers/proposals.controller.js';
import { validate } from '../middleware/validate.js';
import { createProposalSchema } from '../schemas/proposal.schema.js';

const router = Router();

router.post('/', validate(createProposalSchema), createProposalController);
router.get('/:id', getProposalByIdController);

export default router;
