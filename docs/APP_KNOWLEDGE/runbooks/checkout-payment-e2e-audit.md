# Checkout & payment options — E2E audit

Catalog of **parent/member money paths** and which Playwright specs verify them. Update this when adding plans or checkout gates.

## Matrix

| Path | How parent pays | Spec | Notes |
|------|-----------------|------|--------|
| **Pay in full** | Card, one PI for full remaining | `e2e/parent-payment-flow.spec.ts` | Ledger assert remainingBalance=0 |
| **Biweekly (first installment)** | Card for first installment | `e2e/parent-payment-flow.spec.ts` | Plan `#biweekly` |
| **Biweekly installment #2+** | Autopay / journey | `e2e/parent-full-journey.spec.ts` | Registration → 2 sessions → autopay |
| **Upcoming Pay Now** | Card on scheduled row | `e2e/parent-payment-flow.spec.ts` | `seed-upcoming-scheduled-payment` |
| **Partial volunteer credits + card** | Apply checkbox → reduced Pay | `e2e/checkout-volunteer-credits.spec.ts` | $30 credit on $100 class |
| **Credits-only (full cover)** | Apply → **confirm** (no auto-spend) | `e2e/checkout-payment-options-audit.spec.ts` | Requires `confirmCreditsOnlyCheckout` |
| **Credits available but unchecked** | Full card amount; no confirm | `e2e/checkout-payment-options-audit.spec.ts` | Must not auto-spend |
| **Class + unpaid membership** | Order summary $ class + fee | `e2e/checkout-membership-order-summary.spec.ts` | UI amount; full pay in audit suite |
| **Membership dashboard drift** | Combined PI already paid | `e2e/membership-dashboard-after-combined-payment.spec.ts` | Regression Spencer |
| **Public store merch / class** | Guest + test fulfill | `e2e/public-store.spec.ts` | Separate lane |
| **Deposit-only / custom plans** | Not primary parent UI | — | Seed supports `deposit_only`/`custom`; checkout UI filters deposit. Cover via API/integration if needed. |

## Run commands

```bash
# Full member-cart payment audit (this matrix’s interactive suite)
npm run test:e2e -- e2e/checkout-payment-options-audit.spec.ts

# Existing focused suites
npm run test:e2e -- e2e/parent-payment-flow.spec.ts
npm run test:e2e -- e2e/checkout-volunteer-credits.spec.ts
npm run test:e2e:checkout-membership
npm run test:e2e -- e2e/parent-full-journey.spec.ts
```

**Prereqs:** `DATABASE_URL`, Supabase service role (for `linkSupabaseAuth`), **matching** Stripe **test** pair:

- `TESTING_STRIPE_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY` (`sk_test_…`) — must create PaymentIntents (balance API 200).
- Publishable key returned by `GET /api/stripe/config` (`pk_test_…`, usually `VITE_TESTING_STRIPE_PUBLIC_KEY`) — must be the **current** Dashboard publishable key for the **same** account. A revoked/typo `pk_test_` yields Payment Element `401 Invalid API Key` and the Pay button stays on **Loading Payment Form…**.

Restart the dev server after rotating keys (`reuseExistingServer` reuses whatever process is on `:5000`).

## Product invariants under test

1. Server-authoritative pricing (cart snapshot + PI).
2. Credits never spend on passive `create-payment-intent` — only with Apply + confirm when payable is $0.
3. Stripe min $0.50 enforced for positive card charges.
4. Scheduled payments created after first confirmed payment (biweekly), not at abandoned checkout.
