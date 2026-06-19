# Runbook: parent payment investigation

Use this **before** telling a parent they owe money, before ledger corrections, and before closing support tickets about “I paid but the dashboard still shows a balance.”

## Source of truth

| Layer | Role |
|-------|------|
| **Stripe** (succeeded `PaymentIntent`s) | **Source of truth for money collected** |
| **`payments` + enrollments + membership_enrollments** | Application ledger — can drift if webhook/fulfill/backfill missed a slice |
| **Parent dashboard** | Reads ledger + reconcile hooks — can show stale “Pay $X” when ledger lags Stripe |

**Never conclude from DB alone.** A `payments` row with `metadata.backfill: true` or a tuition-only backfill does not prove membership was fulfilled.

## Required steps (agents and humans)

### 1. Stripe audit first

```bash
# Production (live key in .env.prod)
node scripts/with-prod-env.mjs -- npx tsx server/scripts/inspect-parent-stripe-by-email.ts --email parent@example.com

# Or by user id
node scripts/with-prod-env.mjs -- npx tsx server/scripts/inspect-parent-stripe-by-email.ts --parent-id 144 --json
```

Read the output in this order:

1. **Stripe succeeded PaymentIntents** — amounts, dates, `hasMembership` / `membershipAmount` / `enrollmentIds` metadata
2. **✗ MISSING FROM DB** — paid in Stripe, no `payments.stripe_payment_intent_id` → reconcile before blaming the parent
3. **App payments table** — backfill notes, amounts vs Stripe
4. **Membership enrollments** — `pending_payment` with `amount_paid: 0` while Stripe shows membership in combined PI → fulfillment drift (Spencer pattern)
5. **Program enrollments** — tuition `total_paid` vs Stripe class pool

### 2. Retrieve specific PI (when parent cites a date or receipt)

```bash
node scripts/with-prod-env.mjs -- npx tsx -e "
import { getStripeClient } from './server/config/stripe.ts';
const pi = await (await getStripeClient()).paymentIntents.retrieve('pi_...');
console.log(JSON.stringify({ id: pi.id, status: pi.status, amount: pi.amount, metadata: pi.metadata }, null, 2));
"
```

If `retrieve` returns “No such payment_intent”, check **test vs live** key and search by parent email:

```bash
# Same inspect script searches all customers + metadata for that email
```

### 3. Compare allocation to metadata

For combined checkout PIs (`hasMembership: true`):

- `amount` should equal tuition owed + `membershipAmount` (± credits)
- After success, expect:
  - `program_enrollments.total_paid` updated for `enrollmentIds`
  - `membership_enrollments` → `enrolled`, `amount_paid` = membership fee
  - `users.member_id` set (or reconcile on next dashboard load after deploy)

### 4. Fix drift (not “ask parent to pay again”)

| Finding | Action |
|---------|--------|
| Succeeded PI missing from `payments` | `reconcile-payment-intent-to-enrollments.ts` |
| PI in DB, tuition paid, membership pending | `reconcileMembershipLedgerForParent` (dashboard) or manual membership row update; verify PI metadata |
| Stripe shows no succeeded PI | Do **not** mark paid — investigate abandoned `requires_payment_method` PIs |

```bash
node scripts/with-prod-env.mjs -- npx tsx server/scripts/reconcile-payment-intent-to-enrollments.ts pi_...
```

### 5. Verify in UI

- Parent → **Dashboard** (`/parent/home`): no `membership-summary-due`, Member ID visible — reconcile runs on **`GET /api/parent/member-id`** and **`GET /api/billing/summary`** load
- **Payments** tab matches Stripe totals

Regression E2E: `e2e/membership-dashboard-after-combined-payment.spec.ts`

## Agent checklist (copy into thinking)

- [ ] Ran `inspect-parent-stripe-by-email.ts` (or retrieved PI from Stripe API)
- [ ] Listed **all succeeded** PIs for parent email (not only DB `stripe_customer_id`)
- [ ] Checked PI metadata: `hasMembership`, `membershipAmount`, `enrollmentIds`
- [ ] Compared to `payments`, `membership_enrollments`, `program_enrollments`
- [ ] Only then recommended fix or parent-facing reply

## Related

- [payments-and-billing.md](../domains/payments-and-billing.md) — Stripe audit section
- [.agents/skills/asa-payment-patterns/SKILL.md](../../../.agents/skills/asa-payment-patterns/SKILL.md) — investigation protocol
- `server/scripts/reconcile-payment-intent-to-enrollments.ts`
- `server/scripts/inspect-payment-divergence.ts` — legacy hard-coded incidents (prefer email audit script)
