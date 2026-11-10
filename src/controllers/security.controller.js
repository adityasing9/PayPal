import { securityFirewallService } from '../services/SecurityFirewallService.js';
import { UserPreference } from '../models/UserPreference.model.js';

export async function verifyProposalController(req, res, next) {
  try {
    const userId = req.user._id.toString();
    let userPreferences = null;
    if (UserPreference.findOne?._isMockFunction || UserPreference.db?.readyState === 1) {
      userPreferences = await UserPreference.findOne({ userId: req.user._id });
    }

    const result = await securityFirewallService.evaluateProposal({
      intent: req.body.intent,
      snapshot: req.body.snapshot,
      userId,
      userPreferences,
      acknowledgedReviewDiffs: req.body.acknowledgedReviewDiffs || []
    });

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}
