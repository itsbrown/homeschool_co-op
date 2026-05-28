# Credit ledger repair

## Problem

Payments could complete (installment marked paid, enrollment `totalPaid` updated) while the unified credit ledger (`credits.used_amount_cents`, `unified_credit_usage_logs`) was never updated. Parents then saw credits “come back” after refresh.

**Root cause (fixed in app code):** `payment_intent.succeeded` marked scheduled payments `completed` before consuming credits; webhook replay skipped consumption when status was already `completed`. Credit errors were logged but did not fail the webhook.

## Prevention (deploy required)

- `ensureScheduledPaymentCreditsConsumed` runs **before** the completed early-exit (idempotent on replay).
- Webhook **throws** if credits could not be fully recorded (Stripe retries).
- Parent Pay Now (card + credits) creates **credit holds** like autopay.
- Checkout consumption uses correct idempotency keys (`Checkout {pi_…}` + `stripe_payment_history`).

## Find affected families

### SQL (production)

See conversation queries: ledger mismatch (`used_amount_cents` vs usage logs) and completed credit installments with no logs.

### API (school admin, after deploy)

```http
GET /api/credits/admin/integrity-check
```

Returns `runCreditIntegrityCheck` violations plus `missingLedger` candidates for the active school.

### CLI

```bash
# Preview
npx tsx server/scripts/backfill-missing-credit-ledger.ts --dry-run

# Apply (needs DATABASE_URL + Stripe for PI metadata)
npx tsx server/scripts/backfill-missing-credit-ledger.ts --apply

# Optional
npx tsx server/scripts/backfill-missing-credit-ledger.ts --apply --school-id=3 --limit=50
```

### Repair via API

```http
POST /api/credits/admin/repair-ledger
Content-Type: application/json

{ "dryRun": true, "limit": 100 }
```

Set `"dryRun": false` to apply fixes for the current school context.

## Automated tests

```bash
# Unit + mocked webhook (no Postgres)
NODE_ENV=test npm run test:payments

# Credit-focused subset
NODE_ENV=test npx jest --config jest.payments.config.cjs \
  server/tests/ensure-scheduled-payment-credits.test.ts \
  server/tests/fulfill-balance-payment-credits.test.ts \
  server/tests/credit-ledger-repair.test.ts \
  server/tests/webhook-scheduled-credit-failure.test.ts \
  --runInBand

# Integration (requires Postgres)
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/asa_test
NODE_ENV=test npx jest --config jest.integration.config.cjs \
  server/tests/integration/scheduled-payment-stripe-webhook.test.ts \
  server/tests/integration/credit-ledger-repair.integration.test.ts \
  --runInBand
```

## After backfill

1. Re-run `GET /api/credits/admin/integrity-check` — `missingLedger.count` should drop.
2. Confirm parent Credits tab: `usedAmountCents` and usage logs match payments.
3. Spot-check one family: available balance should not cover a duplicate checkout.

## Related

- `docs/grace-mulcahy-backfill.md` — credits **not applied** at charge (overcharge), different issue.
- `GET /api/admin/credit-divergence-audit` — manual Pay Now vs unused credits at charge time.
