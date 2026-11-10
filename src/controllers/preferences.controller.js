import { UserPreference } from '../models/UserPreference.model.js';

export async function getPreferencesController(req, res, next) {
  try {
    let prefs = await UserPreference.findOne({ userId: req.user._id });
    if (!prefs) {
      prefs = await UserPreference.create({
        userId: req.user._id,
        defaultCurrency: 'USD',
        minorUnitExponent: 2,
        maxTransactionLimitMinor: 50000n,
        dailySpendingLimitMinor: 100000n,
        allowedMerchants: ['MERCHANT_KEYCHRON', 'MERCHANT_LOGITECH', 'MERCHANT_BESTBUY'],
        blockedMerchants: ['MERCHANT_SHADY_DEALS'],
        requireExplicitReviewOverMinor: 20000n
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        defaultCurrency: prefs.defaultCurrency,
        minorUnitExponent: prefs.minorUnitExponent,
        maxTransactionLimitMinor: prefs.maxTransactionLimitMinor.toString(),
        dailySpendingLimitMinor: prefs.dailySpendingLimitMinor.toString(),
        allowedMerchants: prefs.allowedMerchants,
        blockedMerchants: prefs.blockedMerchants,
        requireExplicitReviewOverMinor: prefs.requireExplicitReviewOverMinor.toString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferencesController(req, res, next) {
  try {
    const update = {};
    if (req.body.defaultCurrency) update.defaultCurrency = req.body.defaultCurrency;
    if (req.body.minorUnitExponent !== undefined) update.minorUnitExponent = req.body.minorUnitExponent;
    if (req.body.maxTransactionLimitMinor) update.maxTransactionLimitMinor = BigInt(req.body.maxTransactionLimitMinor);
    if (req.body.allowedMerchants) update.allowedMerchants = req.body.allowedMerchants;
    if (req.body.blockedMerchants) update.blockedMerchants = req.body.blockedMerchants;
    if (req.body.requireExplicitReviewOverMinor) {
      update.requireExplicitReviewOverMinor = BigInt(req.body.requireExplicitReviewOverMinor);
    }

    const prefs = await UserPreference.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        defaultCurrency: prefs.defaultCurrency,
        minorUnitExponent: prefs.minorUnitExponent,
        maxTransactionLimitMinor: prefs.maxTransactionLimitMinor.toString(),
        dailySpendingLimitMinor: prefs.dailySpendingLimitMinor.toString(),
        allowedMerchants: prefs.allowedMerchants,
        blockedMerchants: prefs.blockedMerchants,
        requireExplicitReviewOverMinor: prefs.requireExplicitReviewOverMinor.toString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}
