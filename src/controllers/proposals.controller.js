import { proposalService } from '../services/ProposalService.js';

export async function createProposalController(req, res, next) {
  try {
    const proposal = await proposalService.createProposal(req.body);

    return res.status(201).json({
      success: true,
      data: proposal,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function getProposalByIdController(req, res, next) {
  try {
    const proposal = await proposalService.getProposalById(req.params.id);

    return res.status(200).json({
      success: true,
      data: proposal,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}
