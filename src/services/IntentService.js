import { PaymentIntent } from '../models/PaymentIntent.model.js';

export class IntentNotFoundError extends Error {
  constructor(message = 'Payment intent not found', statusCode = 404) {
    super(message);
    this.name = 'IntentNotFoundError';
    this.code = 'INTENT_NOT_FOUND';
    this.statusCode = statusCode;
  }
}

export class IntentService {
  /**
   * Creates a new purchase intent for an authenticated user.
   *
   * @param {{
   *   userId: string | import('mongoose').Types.ObjectId,
   *   prompt: string,
   *   maxBudgetMinor: string,
   *   currency: string,
   *   minorUnitExponent?: number,
   *   category?: string,
   *   constraints?: object
   * }} data
   * @returns {Promise<object>}
   */
  async createIntent({
    userId,
    prompt,
    maxBudgetMinor,
    currency = 'USD',
    minorUnitExponent = 2,
    category = 'General',
    constraints = {}
  }) {
    const budgetBigInt = BigInt(maxBudgetMinor);

    const intent = new PaymentIntent({
      userId,
      version: 1,
      prompt,
      maxBudgetMinor: budgetBigInt,
      currency: currency.toUpperCase(),
      minorUnitExponent,
      category,
      constraints: {
        requiredSpecs: constraints.requiredSpecs || {},
        preferredMerchants: constraints.preferredMerchants || [],
        blockedMerchants: constraints.blockedMerchants || []
      },
      status: 'INITIALIZED'
    });

    await intent.save();

    return {
      intentId: intent._id.toString(),
      version: intent.version,
      prompt: intent.prompt,
      maxBudgetMinor: intent.maxBudgetMinor.toString(),
      currency: intent.currency,
      minorUnitExponent: intent.minorUnitExponent,
      category: intent.category,
      constraints: intent.constraints,
      status: intent.status,
      createdAt: intent.createdAt.toISOString()
    };
  }

  /**
   * Retrieves all intents for a user.
   *
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async getIntentsByUser(userId) {
    const intents = await PaymentIntent.find({ userId }).sort({ createdAt: -1 });
    return intents.map((intent) => ({
      intentId: intent._id.toString(),
      version: intent.version,
      prompt: intent.prompt,
      maxBudgetMinor: intent.maxBudgetMinor.toString(),
      currency: intent.currency,
      minorUnitExponent: intent.minorUnitExponent,
      category: intent.category,
      status: intent.status,
      createdAt: intent.createdAt.toISOString()
    }));
  }

  /**
   * Retrieves a specific intent ensuring ownership by the authenticated user.
   *
   * @param {string} intentId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getIntentById(intentId, userId) {
    const intent = await PaymentIntent.findOne({ _id: intentId, userId });
    if (!intent) {
      throw new IntentNotFoundError();
    }

    return {
      intentId: intent._id.toString(),
      version: intent.version,
      prompt: intent.prompt,
      maxBudgetMinor: intent.maxBudgetMinor.toString(),
      currency: intent.currency,
      minorUnitExponent: intent.minorUnitExponent,
      category: intent.category,
      constraints: intent.constraints,
      status: intent.status,
      createdAt: intent.createdAt.toISOString()
    };
  }
}

export const intentService = new IntentService();
