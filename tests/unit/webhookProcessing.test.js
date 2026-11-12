import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentTransaction } from '../../src/models/PaymentTransaction.model.js';
import { WebhookEvent } from '../../src/models/WebhookEvent.model.js';
import { payPalService } from '../../src/services/PayPalService.js';

const transaction = () => ({
  _id: 'transaction-1',
  paypalOrderId: 'ORDER-1',
  paypalCaptureId: null,
  paypalRefundIds: [],
  amountMinor: 11790n,
  currency: 'USD',
  minorUnitExponent: 2,
  status: 'APPROVED_BY_USER'
});

const captureEvent = (overrides = {}) => ({
  id: 'WH-EVENT-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: 'CAPTURE-1',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '117.90' },
    supplementary_data: { related_ids: { order_id: 'ORDER-1' } }
  },
  ...overrides
});

describe('PayPal verified webhook processing', () => {
  let savedEvent;

  beforeEach(() => {
    vi.restoreAllMocks();
    savedEvent = null;
    vi.spyOn(payPalService, 'verifyWebhookSignature').mockResolvedValue(true);
    vi.spyOn(WebhookEvent, 'findOne').mockImplementation(async () => savedEvent);
    vi.spyOn(WebhookEvent.prototype, 'save').mockImplementation(async function () {
      savedEvent = this;
      return this;
    });
    vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockResolvedValue(null);
    vi.spyOn(WebhookEvent, 'findOneAndUpdate').mockImplementation(async (_filter, update) => {
      if (savedEvent) Object.assign(savedEvent, update.$set);
      return savedEvent || { ...update.$set };
    });
  });

  it('marks a verified capture completed and binds it to the matching order and amount', async () => {
    const tx = transaction();
    vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(tx);
    vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({
      ...tx,
      ...update.$set
    }));

    const result = await payPalService.processWebhook({
      headers: {},
      rawBody: '',
      bodyObj: captureEvent()
    });

    expect(result.status).toBe('VERIFIED_AND_PROCESSED');
    expect(PaymentTransaction.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: tx._id,
        status: { $in: ['CREATED', 'APPROVED_BY_USER', 'CAPTURING'] },
        paypalCaptureId: { $in: [null, 'CAPTURE-1'] }
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'COMPLETED',
          paypalCaptureId: 'CAPTURE-1',
          lastPayPalEventId: 'WH-EVENT-1'
        })
      }),
      { new: true }
    );
    expect(savedEvent.processedStatus).toBe('PROCESSED');
  });

  it.each([
    ['amount', { value: '117.91' }],
    ['currency', { currency_code: 'EUR', value: '117.90' }]
  ])('persists mismatched %s events as failed without changing the transaction', async (_label, amount) => {
    vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(transaction());
    const bodyObj = captureEvent();
    bodyObj.resource.amount = amount;

    const result = await payPalService.processWebhook({ headers: {}, rawBody: '', bodyObj });

    expect(result.status).toBe('FAILED');
    expect(savedEvent.processedStatus).toBe('FAILED');
    expect(PaymentTransaction.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('persists unmatched verified order events as failed', async () => {
    vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);

    const result = await payPalService.processWebhook({
      headers: {},
      rawBody: '',
      bodyObj: captureEvent()
    });

    expect(result.status).toBe('FAILED');
    expect(savedEvent.processedStatus).toBe('FAILED');
  });

  it('marks denied captures failed without initiating a PayPal capture', async () => {
    const tx = transaction();
    vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(tx);
    vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({
      ...tx,
      ...update.$set
    }));
    const bodyObj = captureEvent({
      id: 'WH-DENIED-1',
      event_type: 'PAYMENT.CAPTURE.DENIED',
      resource: {
        ...captureEvent().resource,
        status: 'DECLINED'
      }
    });

    const result = await payPalService.processWebhook({ headers: {}, rawBody: '', bodyObj });

    expect(result.status).toBe('VERIFIED_AND_PROCESSED');
    expect(PaymentTransaction.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'PayPal reported that the capture was denied.'
        })
      }),
      { new: true }
    );
  });

  it('records a full refund, while leaving partial refunds unsupported', async () => {
    const tx = { ...transaction(), status: 'COMPLETED', paypalCaptureId: 'CAPTURE-1' };
    const refund = {
      id: 'CAPTURE-1',
      status: 'REFUNDED',
      amount: { currency_code: 'USD', value: '117.90' },
      supplementary_data: {
        related_ids: {
          order_id: 'ORDER-1',
          capture_id: 'CAPTURE-1',
          refund_id: 'REFUND-1'
        }
      }
    };
    vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(tx);
    vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({
      ...tx,
      ...update.$set,
      paypalRefundIds: ['REFUND-1']
    }));
    const fullRefund = await payPalService.applyVerifiedWebhookEvent({
      id: 'WH-REFUND-1',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: refund
    });
    expect(fullRefund.status).toBe('PROCESSED');
    expect(PaymentTransaction.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED', paypalCaptureId: 'CAPTURE-1' }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'REFUNDED' }),
        $addToSet: { paypalRefundIds: 'REFUND-1' }
      }),
      { new: true }
    );

    vi.mocked(PaymentTransaction.findOneAndUpdate).mockClear();
    const partialRefund = await payPalService.applyVerifiedWebhookEvent({
      id: 'WH-REFUND-PARTIAL',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        ...refund,
        status: 'PARTIALLY_REFUNDED',
        amount: { currency_code: 'USD', value: '10.00' }
      }
    });
    expect(partialRefund.status).toBe('UNSUPPORTED');
    expect(PaymentTransaction.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not process a concurrent duplicate while the first delivery owns the processing lease', async () => {
    let signalLookup;
    let releaseLookup;
    const lookupStarted = new Promise((resolve) => {
      signalLookup = resolve;
    });
    const lookupGate = new Promise((resolve) => {
      releaseLookup = resolve;
    });
    const tx = transaction();
    vi.spyOn(PaymentTransaction, 'findOne').mockImplementation(async () => {
      signalLookup();
      await lookupGate;
      return tx;
    });
    vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({
      ...tx,
      ...update.$set
    }));

    const firstDelivery = payPalService.processWebhook({
      headers: {},
      rawBody: '',
      bodyObj: captureEvent()
    });
    await lookupStarted;
    const duplicate = await payPalService.processWebhook({
      headers: {},
      rawBody: '',
      bodyObj: captureEvent()
    });
    expect(duplicate.status).toBe('PROCESSING');
    releaseLookup();
    expect((await firstDelivery).status).toBe('VERIFIED_AND_PROCESSED');
    expect(PaymentTransaction.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a previously processed duplicate without applying its transaction update again', async () => {
    savedEvent = { paypalEventId: 'WH-EVENT-1', processedStatus: 'PROCESSED' };
    vi.spyOn(PaymentTransaction, 'findOne');

    const result = await payPalService.processWebhook({
      headers: {},
      rawBody: '',
      bodyObj: captureEvent()
    });

    expect(result.status).toBe('ALREADY_PROCESSED');
    expect(PaymentTransaction.findOne).not.toHaveBeenCalled();
  });
});
