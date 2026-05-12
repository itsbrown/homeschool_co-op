# P1-A-13 — Post-payment client cache convergence

## Status: regression covered in CI; manual staging optional but recommended

### Code contract

- **`refreshPostPaymentState`** (`client/src/lib/postPaymentRefresh.ts`) invalidates and refetches React Query keys for enrollments, billing summary, memberships, and payment history after successful payment flows.
- **Call sites:** `PaymentSuccess.tsx`, `CartSuccess.tsx`, `MembershipSuccess.tsx`.

### Automated regression (closure requirement met)

- **`client/src/lib/__tests__/postPaymentRefresh.test.ts`** — asserts every invalidate key and the five immediate refetch targets used to clear stale “Pay now” / owed UI.

Run locally:

```bash
npx jest client/src/lib/__tests__/postPaymentRefresh.test.ts --config jest.config.cjs
```

### Manual staging (recommended once per release train)

After deploy to staging, spot-check in Stripe **test mode**:

1. **Cart checkout** — After `/cart/success`, billing and parent enrollments show updated balances without hard refresh.
2. **Membership success** — Membership and `/api/parent/memberships`-backed UI updates without reload.
3. **Billing page** — `/api/billing/summary` and `billing-summary` driven widgets match server totals.

Record operator initials + date in your release notes when performed.

### Epic closure

- [x] Deterministic invalidation/refetch wired (`postPaymentRefresh`).
- [x] Regression tests prove query-key contract (`postPaymentRefresh.test.ts`).
- [ ] Optional: staging smoke per release (checkbox above).
