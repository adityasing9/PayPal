import mongoose from 'mongoose';
import { ProductProposal } from '../models/ProductProposal.model.js';
import { CheckoutSnapshot } from '../models/CheckoutSnapshot.model.js';
import { PaymentIntent } from '../models/PaymentIntent.model.js';
import {
  extractCanonicalSnapshotPayload,
  computeSnapshotCanonicalHash
} from '../utils/canonicalJson.js';
import { catalogService } from './CatalogService.js';

export class ProposalNotFoundError extends Error {
  constructor(message = 'Proposal not found', statusCode = 404) {
    super(message);
    this.name = 'ProposalNotFoundError';
    this.code = 'PROPOSAL_NOT_FOUND';
    this.statusCode = statusCode;
  }
}

export class ProposalValidationError extends Error {
  constructor(message = 'Invalid proposal data', statusCode = 400) {
    super(message);
    this.name = 'ProposalValidationError';
    this.code = 'PROPOSAL_VALIDATION_ERROR';
    this.statusCode = statusCode;
  }
}

export class ProposalService {
  /**
   * Creates a validated product proposal and its associated immutable CheckoutSnapshot.
   *
   * @param {object} data - Validated createProposalSchema payload
   * @returns {Promise<object>}
   */
  async createProposal(data) {
    // 1. Verify Intent exists
    const intent = await PaymentIntent.findById(data.intentId);
    if (!intent) {
      throw new ProposalValidationError(`PaymentIntent "${data.intentId}" does not exist.`);
    }

    // 2. Validate product against verified catalog fixture
    const catalogProduct = catalogService.getProductById(data.productId);
    if (!catalogProduct) {
      throw new ProposalValidationError(`Product "${data.productId}" not found in verified catalog.`);
    }

    // 3. Verify arithmetic integrity: base + shipping + tax - discount === total
    const baseBig = BigInt(data.pricing.basePriceMinor);
    const shipBig = BigInt(data.pricing.shippingMinor || '0');
    const taxBig = BigInt(data.pricing.taxMinor || '0');
    const discBig = BigInt(data.pricing.discountMinor || '0');
    const totalBig = BigInt(data.pricing.totalPriceMinor);

    const calculatedTotal = baseBig + shipBig + taxBig - discBig;
    if (calculatedTotal !== totalBig) {
      throw new ProposalValidationError(
        `Pricing arithmetic mismatch: base(${baseBig}) + shipping(${shipBig}) + tax(${taxBig}) - discount(${discBig}) = ${calculatedTotal}, but declared totalPriceMinor is ${totalBig}.`
      );
    }

    // Convert line items to BigInt for storage
    const lineItemsToStore = data.lineItems.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceMinor: BigInt(item.unitPriceMinor)
    }));

    // Create ProductProposal
    const proposal = new ProductProposal({
      intentId: intent._id,
      productId: new mongoose.Types.ObjectId(), // Reference placeholder
      variantSku: data.variantSku,
      title: data.title,
      merchantId: data.merchant.id,
      paypalMerchantId: data.merchant.paypalMerchantId,
      lineItems: lineItemsToStore,
      pricing: {
        basePriceMinor: baseBig,
        shippingMinor: shipBig,
        taxMinor: taxBig,
        discountMinor: discBig,
        totalPriceMinor: totalBig,
        currency: data.pricing.currency.toUpperCase(),
        minorUnitExponent: data.pricing.minorUnitExponent
      },
      recurring: {
        isRecurring: data.recurring?.isRecurring || false,
        billingInterval: data.recurring?.billingInterval || null,
        billingCycles: data.recurring?.billingCycles || 0
      },
      recommendationRank: data.recommendationRank || 1,
      agentRationale: data.agentRationale || '',
      status: 'PENDING_VERIFICATION'
    });

    await proposal.save();

    // 4. Construct RFC 8785 canonical snapshot payload
    const canonicalSnapshotPayload = extractCanonicalSnapshotPayload({
      ...data,
      rawDescription: catalogProduct.description || ''
    });

    // Deterministic RFC 8785 SHA-256 hash
    const snapshotHash = computeSnapshotCanonicalHash(canonicalSnapshotPayload);

    // 5. Store immutable CheckoutSnapshot
    const snapshot = new CheckoutSnapshot({
      proposalId: proposal._id,
      intentId: intent._id,
      snapshotPayload: {
        ...canonicalSnapshotPayload,
        lineItems: lineItemsToStore,
        pricing: {
          basePriceMinor: baseBig,
          shippingMinor: shipBig,
          taxMinor: taxBig,
          discountMinor: discBig,
          totalPriceMinor: totalBig,
          currency: data.pricing.currency.toUpperCase(),
          minorUnitExponent: data.pricing.minorUnitExponent
        }
      },
      snapshotHash,
      capturedAt: new Date()
    });

    await snapshot.save();

    return {
      proposalId: proposal._id.toString(),
      intentId: intent._id.toString(),
      snapshotId: snapshot._id.toString(),
      snapshotHash,
      totalPriceMinor: proposal.pricing.totalPriceMinor.toString(),
      currency: proposal.pricing.currency,
      status: proposal.status,
      createdAt: proposal.createdAt.toISOString()
    };
  }

  /**
   * Retrieves proposal details and its snapshot.
   *
   * @param {string} proposalId
   * @returns {Promise<object>}
   */
  async getProposalById(proposalId) {
    const proposal = await ProductProposal.findById(proposalId);
    if (!proposal) {
      throw new ProposalNotFoundError();
    }

    const snapshot = await CheckoutSnapshot.findOne({ proposalId: proposal._id });

    return {
      proposalId: proposal._id.toString(),
      intentId: proposal.intentId.toString(),
      title: proposal.title,
      merchantId: proposal.merchantId,
      paypalMerchantId: proposal.paypalMerchantId,
      pricing: {
        basePriceMinor: proposal.pricing.basePriceMinor.toString(),
        shippingMinor: proposal.pricing.shippingMinor.toString(),
        taxMinor: proposal.pricing.taxMinor.toString(),
        discountMinor: proposal.pricing.discountMinor.toString(),
        totalPriceMinor: proposal.pricing.totalPriceMinor.toString(),
        currency: proposal.pricing.currency,
        minorUnitExponent: proposal.pricing.minorUnitExponent
      },
      recurring: proposal.recurring,
      status: proposal.status,
      snapshotId: snapshot ? snapshot._id.toString() : null,
      snapshotHash: snapshot ? snapshot.snapshotHash : null,
      createdAt: proposal.createdAt.toISOString()
    };
  }
}

export const proposalService = new ProposalService();
