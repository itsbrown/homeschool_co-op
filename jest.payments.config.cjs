const base = require('./jest.integration.config.cjs');

/** Focused server tests for billing, webhooks, and autopay policy (fast CI signal). */
module.exports = {
  ...base,
  /** Avoid hanging workers when tests leave timers/handles open (CI noise). */
  forceExit: true,
  testMatch: [
    '<rootDir>/server/tests/billing-cents-consistency.test.ts',
    '<rootDir>/server/tests/cart-checkout-enrollment-match.test.ts',
    '<rootDir>/server/tests/checkout-enrollment-outstanding.test.ts',
    '<rootDir>/server/tests/checkout-payment-plans-offer.test.ts',
    '<rootDir>/server/tests/biweekly-schedule-end-buffer.test.ts',
    '<rootDir>/server/tests/idempotency-helper.test.ts',
    '<rootDir>/server/tests/integration/checkout-pi-webhook-idempotency.test.ts',
    '<rootDir>/server/tests/integration/payment-webhook-replay.test.ts',
    '<rootDir>/server/tests/autopay-lifecycle.test.ts',
    '<rootDir>/server/tests/autopay-policy.test.ts',
    '<rootDir>/server/tests/reconciliation-autopay.test.ts',
    '<rootDir>/server/tests/scheduled-payment-auto-pay-webhook-helper.test.ts',
    '<rootDir>/server/tests/integration/scheduled-payment-stripe-webhook.test.ts',
    '<rootDir>/server/tests/scheduled-payment-due-query-source.test.ts',
    '<rootDir>/server/tests/scheduled-payment-intent-metadata.test.ts',
    '<rootDir>/server/tests/payment-plan-policy-matrix.test.ts',
    '<rootDir>/server/tests/scheduled-payment-installment-variants.test.ts',
    '<rootDir>/server/tests/reconciliation-ledger-equivalence.test.ts',
    '<rootDir>/server/tests/autopay-metadata-flag.test.ts',
    '<rootDir>/server/tests/balance-payment-metadata.test.ts',
    '<rootDir>/server/tests/payment-settlement-display.test.ts',
  ],
};
