const base = require('./jest.integration.config.cjs');

/** Focused server tests for billing, webhooks, and autopay policy (fast CI signal). */
module.exports = {
  ...base,
  testMatch: [
    '<rootDir>/server/tests/billing-cents-consistency.test.ts',
    '<rootDir>/server/tests/idempotency-helper.test.ts',
    '<rootDir>/server/tests/integration/payment-webhook-replay.test.ts',
    '<rootDir>/server/tests/autopay-lifecycle.test.ts',
    '<rootDir>/server/tests/autopay-policy.test.ts',
    '<rootDir>/server/tests/reconciliation-autopay.test.ts',
    '<rootDir>/server/tests/scheduled-payment-due-query-source.test.ts',
    '<rootDir>/server/tests/payment-plan-policy-matrix.test.ts',
  ],
};
