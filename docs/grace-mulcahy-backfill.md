# Grace Mulcahy — Pay Now Credit Divergence Backfill (Task #173)

## Summary

On the date the divergence was reported, parent **Grace Mulcahy** was charged
**$271.50** in two consecutive PaymentIntents while the Pay Now dialog she
was looking at displayed **$181.50** as the amount due. She held an approved
**$90.00** credit at the time of charge that was never applied. The
overcharge equals the unapplied credit:

```
$271.50 charged – $181.50 displayed = $90.00 unapplied credit
```

Affected Stripe PaymentIntents:

| PaymentIntent ID                | Amount   |
| ------------------------------- | -------- |
| `pi_3TS04MGhVuNOnUs712058clO`   | partial of $271.50 |
| `pi_3TS05XGhVuNOnUs7119YsBuL`   | partial of $271.50 |

(Combined the two charges total the $271.50 actually billed to her card.)

The root-cause fix shipped under Task #173 routes the parent-initiated Pay
Now flow through the same credit-aware logic as the auto-pay scheduler —
including the credits-only zero-charge path and a server-side divergence
guard that returns HTTP 409 if the about-to-charge amount no longer matches
what the client displayed.

This document covers the **one-off backfill** for Grace specifically. New
divergences should not occur after the fix; the audit endpoint surfaces any
that slip through.

---

## 1. Identify the affected scheduled-payment rows

```sql
-- Confirm the two PIs and their linked scheduled_payments rows
SELECT
  sp.id              AS scheduled_payment_id,
  sp.parent_email,
  sp.amount,
  sp.status,
  sp.processed_at,
  sp.charged_by,
  sp.completion_source,
  sp.stripe_payment_intent_id,
  sp.installment_number,
  sp.total_installments,
  sp.metadata
FROM scheduled_payments sp
WHERE sp.stripe_payment_intent_id IN (
  'pi_3TS04MGhVuNOnUs712058clO',
  'pi_3TS05XGhVuNOnUs7119YsBuL'
);
```

Capture the rows. We will refer to them as `SP_A` (the first PI) and `SP_B`
(the second PI).

## 2. Confirm Grace's credit ledger at the time of charge

```sql
-- Find Grace's user id
SELECT id, email, name FROM users WHERE email ILIKE 'grace.mulcahy%';

-- All approved credits and their consumption
SELECT
  c.id,
  c.credit_type,
  c.title,
  c.credit_amount_cents,
  c.used_amount_cents,
  (c.credit_amount_cents - c.used_amount_cents) AS unused_cents,
  c.status,
  c.approved_at
FROM credits c
WHERE c.user_id = <grace_user_id>
ORDER BY c.approved_at;
```

Verify that the approved-and-unused balance was **9000 cents ($90.00)** at
the time `SP_A.processed_at`.

## 3. Issue a $90 refund on Stripe

The overcharge was $90 total. Refund $90 against either PI (Stripe allows
partial refunds; pick the larger of the two so the refund clears in a
single operation), or split it 50/50 across both — whichever your
finance/audit policy prefers. Use the Stripe Dashboard or:

```bash
# Example using Stripe CLI; adjust amount per chosen split.
stripe refunds create \
  --payment-intent pi_3TS04MGhVuNOnUs712058clO \
  --amount 9000 \
  --reason requested_by_customer \
  --metadata task=173 \
  --metadata reason=credit_unapplied_grace_mulcahy
```

Capture the refund id (`re_…`) — you will need it for the database row in
step 4.

## 4. Record the refund in our DB

Refunds in our system live in `refunds` and are linked back to
`scheduled_payments` via `scheduled_payment_id`. Insert a row that mirrors
the Stripe refund and tag `source = 'manual_admin'` so the row is not
double-processed by the reconciliation worker.

```sql
INSERT INTO refunds (
  school_id,
  scheduled_payment_id,
  parent_id,
  parent_email,
  amount_cents,
  currency,
  reason,
  stripe_refund_id,
  source,
  notes,
  created_at,
  updated_at
) VALUES (
  <grace_school_id>,
  <SP_A.id>,
  <grace_user_id>,
  'grace.mulcahy@…',
  9000,
  'usd',
  'requested_by_customer',
  're_xxxxxxxxxxxx', -- from step 3
  'manual_admin',
  'Task 173 backfill — $90 unapplied credit refunded; see docs/grace-mulcahy-backfill.md',
  NOW(),
  NOW()
);
```

> If the column names in your environment differ (the schema uses `amount`
> rather than `amount_cents` in some installs), check `\d refunds` first.

## 5. Mark the credit as consumed

So Grace's "credit available" balance drops by $90 to reflect the refund
that took its place:

```sql
-- Pick the credit row (or rows) you are consuming. If there is a single
-- $90 credit, the simplest correct ledger entry is to mark it fully used.
UPDATE credits
SET
  used_amount_cents = credit_amount_cents,
  status = 'used',
  updated_at = NOW()
WHERE id = <grace_credit_id>
  AND user_id = <grace_user_id>
  AND status IN ('approved', 'partially_used');

-- Mirror the consumption in the unified credit usage log so the audit
-- trail shows where the credit went.
INSERT INTO unified_credit_usage_logs (
  user_id,
  school_id,
  credit_id,
  amount_cents,
  used_for_type,
  used_for_id,
  notes,
  created_at
) VALUES (
  <grace_user_id>,
  <grace_school_id>,
  <grace_credit_id>,
  9000,
  'refund_backfill',
  <refund_row_id>,
  'Task 173 backfill — credit redeemed via $90 refund of overcharge',
  NOW()
);
```

> Confirm column names in your environment with `\d credits` and
> `\d unified_credit_usage_logs` first; the unified usage log table name
> may be `credit_usage_logs` in older deployments.

## 6. Patch the scheduled-payment metadata

Stamp the row(s) with `creditsAppliedCents` so the credit-divergence audit
endpoint stops flagging it:

```sql
UPDATE scheduled_payments
SET metadata = COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
       'creditsAppliedCents', 9000,
       'task173BackfillRefundId', <refund_row_id>
     ),
  updated_at = NOW()
WHERE id = <SP_A.id>;
```

If you split the refund across both PIs, set
`creditsAppliedCents` proportionally on each row (e.g. 4500 / 4500) so the
sum still equals 9000.

## 7. Notify Grace

Send Grace a short note explaining the $90 will appear back on her card
within 5–10 business days, with the refund id for her records. Use the
existing parent notification template (`emailTemplates/refund_issued`) so
the messaging matches every other refund she might receive.

## 8. Verify nothing else is outstanding

Run the new credit-divergence audit endpoint after the backfill is in
place — Grace's row should no longer appear:

```bash
# Replace <admin-jwt> with a school-admin token for Grace's school.
curl -s -H "Authorization: Bearer <admin-jwt>" \
  https://<host>/api/admin/credit-divergence-audit \
  | jq '.flaggedPayments[] | select(.parentEmail | startswith("grace"))'
```

The result should be empty. The endpoint will, however, list any other
parents whose manual Pay Now charges occurred while they had unused
credits — those are the next backfill candidates.

---

## Why this won't happen again

After Task #173:

- **Manual Pay Now defaults `applyCredits=true`**, mirroring auto-pay; a
  parent with an approved credit will never be silently charged the gross
  amount.
- **Credits-only payments take the same atomic zero-charge path as
  auto-pay** (`createCreditHolds` → `completeCreditsOnlyPayment`). No
  Stripe call is made, the row is tagged
  `chargedBy = 'parent_manual'` /
  `completionSource = 'parent_manual_credits_only'`.
- **The `/api/scheduled-payments/pay` endpoint enforces a divergence
  guard**: if the server-computed `chargeAmount` differs from the client's
  `expectedChargeAmount` by more than 1¢, the request is rejected with
  HTTP 409 `charge_amount_diverged` and the parent is asked to refresh.
- **The Outstanding Balance card now shows credits explicitly**, so
  parents see the same "− Credits available: $X" math the server will
  apply.
- **A new admin endpoint
  (`GET /api/admin/financial-reports/credit-divergence-audit`)** lists any
  manual Pay Now completions where the parent still holds unused approved
  credits, with an estimated refund amount so finance can triage quickly.
