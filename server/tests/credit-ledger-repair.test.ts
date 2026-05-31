import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as creditLedgerRepair from '../lib/credit-ledger-repair';
import type { MissingCreditLedgerEntry } from '../lib/credit-ledger-repair';

const { repairMissingCreditLedgerEntry } = creditLedgerRepair;

jest.mock('../lib/ensure-scheduled-payment-credits-consumed', () => ({
  ensureScheduledPaymentCreditsConsumed: jest.fn(),
  scheduledPaymentCreditUsageDescription: jest.fn(
    (id: number, inst?: string, total?: string) =>
      `Scheduled payment ${id} — installment ${inst}/${total}`,
  ),
}));

jest.mock('../lib/fulfill-balance-payment-intent', () => ({
  consumeCreditsFromPaymentIntentMetadata: jest.fn(),
}));

jest.mock('../config/stripe', () => ({
  getStripeClient: jest.fn(),
}));

import { ensureScheduledPaymentCreditsConsumed } from '../lib/ensure-scheduled-payment-credits-consumed';
import { consumeCreditsFromPaymentIntentMetadata } from '../lib/fulfill-balance-payment-intent';

const baseEntry: MissingCreditLedgerEntry = {
  kind: 'scheduled_payment',
  userId: 10,
  parentEmail: 'parent@test.com',
  creditsAppliedCents: 2500,
  scheduledPaymentId: 88,
  installmentNumber: '2',
  totalInstallments: '4',
};

describe('repairMissingCreditLedgerEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dry-run does not call storage mutations', async () => {
    const r = await repairMissingCreditLedgerEntry(baseEntry, { dryRun: true });
    expect(r.repaired).toBe(false);
    expect(r.dryRun).toBe(true);
    expect(ensureScheduledPaymentCreditsConsumed).not.toHaveBeenCalled();
  });

  it('repairs scheduled_payment via ensureScheduledPaymentCreditsConsumed', async () => {
    (ensureScheduledPaymentCreditsConsumed as jest.Mock).mockResolvedValue({
      consumedCents: 2500,
      skippedAlreadyApplied: false,
    });

    const r = await repairMissingCreditLedgerEntry(baseEntry, { dryRun: false });
    expect(r.repaired).toBe(true);
    expect(ensureScheduledPaymentCreditsConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledPaymentId: 88,
        userId: 10,
        creditsAppliedCents: 2500,
      }),
    );
  });

  it('reports failure when consumption incomplete', async () => {
    (ensureScheduledPaymentCreditsConsumed as jest.Mock).mockResolvedValue({
      consumedCents: 500,
      skippedAlreadyApplied: false,
    });

    const r = await repairMissingCreditLedgerEntry(baseEntry, { dryRun: false });
    expect(r.repaired).toBe(false);
    expect(r.error).toMatch(/Incomplete consumption/);
  });

  it('repairs checkout via Stripe PI when pi_ id present', async () => {
    const entry: MissingCreditLedgerEntry = {
      kind: 'payment_record',
      userId: 10,
      parentEmail: 'parent@test.com',
      creditsAppliedCents: 1500,
      paymentIntentId: 'pi_repair_1',
    };

    const { getStripeClient } = await import('../config/stripe');
    (getStripeClient as jest.Mock).mockResolvedValue({
      paymentIntents: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'pi_repair_1',
          metadata: { creditsAppliedCents: '1500', userId: '10' },
        }),
      },
    });
    (consumeCreditsFromPaymentIntentMetadata as jest.Mock).mockResolvedValue({
      creditsConsumedCents: 1500,
      creditsSkippedAlreadyApplied: false,
    });

    const r = await repairMissingCreditLedgerEntry(entry, { dryRun: false });
    expect(r.repaired).toBe(true);
    expect(consumeCreditsFromPaymentIntentMetadata).toHaveBeenCalled();
  });
});

