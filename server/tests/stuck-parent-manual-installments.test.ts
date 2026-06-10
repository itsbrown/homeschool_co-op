import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../db', () => ({ getDb: jest.fn() }));
jest.mock('../storage', () => ({ storage: {} }));
jest.mock('../config/stripe', () => ({ getStripeClient: jest.fn() }));

import { isRecoverableStuckParentManualRow } from '../lib/stuck-parent-manual-installments';

describe('isRecoverableStuckParentManualRow', () => {
  it('returns true for processing + parent_manual', () => {
    expect(
      isRecoverableStuckParentManualRow({
        status: 'processing',
        chargedBy: 'parent_manual',
        stripePaymentIntentId: 'pi_123',
      }),
    ).toBe(true);
  });

  it('returns true for failed + parent_manual + PI id', () => {
    expect(
      isRecoverableStuckParentManualRow({
        status: 'failed',
        chargedBy: 'parent_manual',
        stripePaymentIntentId: 'pi_123',
      }),
    ).toBe(true);
  });

  it('returns false for failed parent_manual without PI', () => {
    expect(
      isRecoverableStuckParentManualRow({
        status: 'failed',
        chargedBy: 'parent_manual',
        stripePaymentIntentId: null,
      }),
    ).toBe(false);
  });

  it('returns false for autopay processing', () => {
    expect(
      isRecoverableStuckParentManualRow({
        status: 'processing',
        chargedBy: 'autopay',
        stripePaymentIntentId: 'pi_123',
      }),
    ).toBe(false);
  });

  it('returns false for pending parent_manual', () => {
    expect(
      isRecoverableStuckParentManualRow({
        status: 'pending',
        chargedBy: 'parent_manual',
        stripePaymentIntentId: null,
      }),
    ).toBe(false);
  });
});
