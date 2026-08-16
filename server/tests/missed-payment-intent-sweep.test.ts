/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type Stripe from 'stripe';
import {
  classifyMissedPaymentIntent,
  collectSweepFindings,
  isAsaCheckoutPaymentIntent,
  isMissedPiSweepAutoFixEnabled,
  isMissedPiSweepEnabled,
  isPaymentIntentFullyRefunded,
  listSucceededAsaPaymentIntents,
  parseEnrollmentIdsFromMetadata,
  redactFindingForLog,
  resolveMissedPiSweepConfig,
  type DbPresence,
  type StripePaymentIntentLister,
} from '../lib/missed-payment-intent-sweep';

function pi(overrides: Partial<Stripe.PaymentIntent> & { id: string }): Stripe.PaymentIntent {
  return {
    object: 'payment_intent',
    amount: 167500,
    currency: 'usd',
    status: 'succeeded',
    created: 1779882373,
    metadata: {},
    client_secret: 'pi_secret_should_never_log',
    ...overrides,
  } as Stripe.PaymentIntent;
}

const TAMIR = pi({
  id: 'pi_3TbfubGhVuNOnUs71rhnshHf',
  amount: 167500,
  metadata: {
    createdBy: 'asa_payment_system',
    enrollmentIds: '[436]',
    parentEmail: 'tamir.sartena@gmail.com',
    paymentPlan: 'full',
    hasMembership: 'true',
  },
});

const MISSING: DbPresence = { inPayments: false, inHistory: false };

describe('missed-payment-intent-sweep filter/classify', () => {
  it('treats createdBy=asa_payment_system as in-scope', () => {
    expect(
      isAsaCheckoutPaymentIntent({
        metadata: { createdBy: 'asa_payment_system' },
      } as Stripe.PaymentIntent),
    ).toBe(true);
  });

  it('treats parentEmail or enrollmentIds as in-scope without createdBy', () => {
    expect(
      isAsaCheckoutPaymentIntent({
        metadata: { parentEmail: 'a@b.com' },
      } as Stripe.PaymentIntent),
    ).toBe(true);
    expect(
      isAsaCheckoutPaymentIntent({
        metadata: { enrollmentIds: '[1]' },
      } as Stripe.PaymentIntent),
    ).toBe(true);
  });

  it('excludes PIs with no ASA checkout metadata', () => {
    expect(isAsaCheckoutPaymentIntent({ metadata: {} } as Stripe.PaymentIntent)).toBe(false);
    expect(
      isAsaCheckoutPaymentIntent({
        metadata: { source: 'unrelated' },
      } as Stripe.PaymentIntent),
    ).toBe(false);
  });

  it('parses enrollment ids from metadata JSON', () => {
    expect(parseEnrollmentIdsFromMetadata({ enrollmentIds: '[436, 437]' })).toEqual([436, 437]);
    expect(parseEnrollmentIdsFromMetadata({ enrollmentIds: 'not-json' })).toEqual([]);
  });

  it('flags Tamir-shaped succeeded PI missing from payments as critical + auto-fix eligible', () => {
    const finding = classifyMissedPaymentIntent(TAMIR, MISSING);
    expect(finding.classification).toBe('missed');
    expect(finding.severity).toBe('critical');
    expect(finding.autoFixEligible).toBe(true);
    expect(finding.enrollmentIds).toEqual([436]);
    expect(finding.parentEmail).toBe('tamir.sartena@gmail.com');
    expect(finding.amountCents).toBe(167500);
  });

  it('classifies already-in-payments as not a miss', () => {
    const finding = classifyMissedPaymentIntent(TAMIR, { inPayments: true, inHistory: true });
    expect(finding.classification).toBe('already_in_payments');
    expect(finding.autoFixEligible).toBe(false);
  });

  it('classifies history-only as warning and not auto-fixable', () => {
    const finding = classifyMissedPaymentIntent(TAMIR, { inPayments: false, inHistory: true });
    expect(finding.classification).toBe('history_only');
    expect(finding.severity).toBe('warning');
    expect(finding.autoFixEligible).toBe(false);
  });

  it('skips non-succeeded PIs', () => {
    const finding = classifyMissedPaymentIntent(
      pi({ id: 'pi_requires', status: 'requires_payment_method', metadata: TAMIR.metadata }),
      MISSING,
    );
    expect(finding.classification).toBe('not_succeeded');
    expect(finding.autoFixEligible).toBe(false);
  });

  it('skips auto-fix when fully refunded or missing enrollment ids', () => {
    const refunded = classifyMissedPaymentIntent(
      pi({
        id: 'pi_refunded',
        metadata: TAMIR.metadata,
        latest_charge: { refunded: true, amount_refunded: 167500 } as any,
      }),
      MISSING,
    );
    expect(refunded.classification).toBe('missed');
    expect(refunded.autoFixEligible).toBe(false);
    expect(refunded.skipAutoFixReason).toBe('fully_refunded');

    const noEnrollments = classifyMissedPaymentIntent(
      pi({
        id: 'pi_no_enr',
        metadata: { createdBy: 'asa_payment_system', parentEmail: 'a@b.com' },
      }),
      MISSING,
    );
    expect(noEnrollments.classification).toBe('missed');
    expect(noEnrollments.autoFixEligible).toBe(false);
    expect(noEnrollments.skipAutoFixReason).toBe('no_enrollment_ids');
  });

  it('detects fully refunded from latest_charge.amount_refunded', () => {
    expect(
      isPaymentIntentFullyRefunded({
        amount: 1000,
        latest_charge: { amount_refunded: 1000 } as any,
      }),
    ).toBe(true);
    expect(
      isPaymentIntentFullyRefunded({
        amount: 1000,
        latest_charge: 'ch_123',
      }),
    ).toBe(false);
  });

  it('collectSweepFindings keeps missed + history_only and drops already recorded', () => {
    const already = pi({ id: 'pi_ok', metadata: TAMIR.metadata });
    const findings = collectSweepFindings(
      [TAMIR, already, pi({ id: 'pi_other', metadata: {} })],
      new Map([
        [TAMIR.id, MISSING],
        [already.id, { inPayments: true, inHistory: false }],
      ]),
    );
    expect(findings.map((f) => f.paymentIntentId)).toEqual([TAMIR.id]);
  });

  it('redacts client_secret from log payload', () => {
    const finding = classifyMissedPaymentIntent(TAMIR, MISSING);
    const redacted = redactFindingForLog(finding);
    expect(JSON.stringify(redacted)).not.toContain('client_secret');
    expect(JSON.stringify(redacted)).not.toContain('pi_secret');
    expect(redacted.piId).toBe(TAMIR.id);
  });
});

describe('missed-payment-intent-sweep Stripe list (mocked)', () => {
  it('paginates, filters succeeded ASA PIs, and honors max PIs', async () => {
    const pages: Array<{ data: Stripe.PaymentIntent[]; has_more: boolean }> = [
      {
        data: [
          TAMIR,
          pi({ id: 'pi_unrelated', metadata: {} }),
          pi({
            id: 'pi_pending',
            status: 'requires_payment_method',
            metadata: TAMIR.metadata,
          }),
        ],
        has_more: true,
      },
      {
        data: [
          pi({
            id: 'pi_scheduled',
            metadata: { parentEmail: 'b@c.com', enrollmentIds: '[9]', paymentType: 'scheduled_payment' },
          }),
        ],
        has_more: false,
      },
    ];
    let calls = 0;
    const stripe: StripePaymentIntentLister = {
      paymentIntents: {
        list: async () => {
          const page = pages[calls] ?? { data: [], has_more: false };
          calls += 1;
          return page;
        },
      },
    };

    const listed = await listSucceededAsaPaymentIntents(stripe, {
      lookbackDays: 90,
      maxPages: 5,
      maxPaymentIntents: 50,
      pageSize: 100,
      nowMs: 1_777_000_000_000,
    });

    expect(calls).toBe(2);
    expect(listed.pagesFetched).toBe(2);
    expect(listed.truncated).toBe(false);
    expect(listed.paymentIntents.map((p) => p.id)).toEqual([
      'pi_3TbfubGhVuNOnUs71rhnshHf',
      'pi_scheduled',
    ]);
  });

  it('stops at maxPaymentIntents and marks truncated', async () => {
    const stripe: StripePaymentIntentLister = {
      paymentIntents: {
        list: async () => ({
          data: [
            pi({ id: 'pi_a', metadata: { createdBy: 'asa_payment_system' } }),
            pi({ id: 'pi_b', metadata: { createdBy: 'asa_payment_system' } }),
          ],
          has_more: true,
        }),
      },
    };
    const listed = await listSucceededAsaPaymentIntents(stripe, {
      lookbackDays: 14,
      maxPages: 10,
      maxPaymentIntents: 1,
      pageSize: 100,
    });
    expect(listed.paymentIntents).toHaveLength(1);
    expect(listed.truncated).toBe(true);
  });
});

describe('missed-payment-intent-sweep config flags', () => {
  it('defaults on in production when unset, off in development', () => {
    expect(isMissedPiSweepEnabled({}, 'production')).toBe(true);
    expect(isMissedPiSweepEnabled({}, 'development')).toBe(false);
    expect(isMissedPiSweepEnabled({ MISSED_PI_SWEEP_ENABLED: 'false' }, 'production')).toBe(false);
    expect(isMissedPiSweepEnabled({ MISSED_PI_SWEEP_ENABLED: 'true' }, 'development')).toBe(true);
  });

  it('keeps auto-fix off unless explicitly enabled', () => {
    expect(isMissedPiSweepAutoFixEnabled({})).toBe(false);
    expect(isMissedPiSweepAutoFixEnabled({ MISSED_PI_SWEEP_AUTO_FIX: 'true' })).toBe(true);
  });

  it('resolves lookback and bounds', () => {
    const config = resolveMissedPiSweepConfig(
      { MISSED_PI_SWEEP_LOOKBACK_DAYS: '90', MISSED_PI_SWEEP_MAX_PAGES: '3' },
      'production',
    );
    expect(config.lookbackDays).toBe(90);
    expect(config.maxPages).toBe(3);
    expect(config.enabled).toBe(true);
    expect(config.autoFix).toBe(false);
  });
});
