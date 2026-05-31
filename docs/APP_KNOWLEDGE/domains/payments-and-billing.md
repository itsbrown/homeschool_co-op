# Payments and billing

Domain doc for Stripe checkout, enrollment ledgers, credits, prod balance audits, and parent-facing balance email.

## Purpose

Parents pay via cart checkout (Stripe PaymentIntents). The server is authoritative for pricing. Enrollments track `total_cost`, `total_paid`, and balance fields; approved credits reduce what is owed. Admins run prod corrections when ledger rows drift from cash + credits actually collected.

## Critical invariants

- **All amounts in cents** (integer). Display with `/100`.
- **`effective_balance` is authoritative for “amount owed”** — computed as `total_cost - total_paid - comp_amount_cents` (see `computeEffectiveBalance` in `shared/schema.ts`). Do not trust `remaining_balance` alone when it disagrees.
- **Approved credits must be consumed** via `unified_credit_usage_logs` and `credits.used_amount_cents` when applied at checkout or in an admin correction. An approved credit with `used_amount_cents = 0` while enrollments still owe money is a ledger bug.
- **Do not JOIN `payments` when summing enrollment balances** — inflates totals (one row per payment × each enrollment). Aggregate `program_enrollments` only, or use a subquery for payment counts.
- **Scheduled payments are created post–first successful payment**, not at cart abandon — see `asa-payment-patterns` skill.

## Balance fields (program enrollments)

| Field | Meaning |
|-------|---------|
| `total_cost` | Full tuition for the enrollment (may be list price even when checkout charged a prorated or discounted amount — verify against PI + credits) |
| `total_paid` | Cash + credit applied to this enrollment |
| `comp_amount_cents` | Comp value (100% comp → equals `total_cost`) |
| `effective_balance` | What billing UI and family balance email should use |
| `remaining_balance` | Legacy/stored column; can be **0 while `effective_balance` > 0** after partial pay or missed credit application |
| `payment_status` | e.g. `completed`, `partial_payment`, `stripe_managed` — may lag until ledger is reconciled |

**Membership:** separate table `membership_enrollments` (`amount_paid`, `remaining_balance`, status). Include in family balance totals.

## Prod balance audit (read-only)

```bash
node scripts/with-prod-env.mjs node server/scripts/prod-query.mjs "SELECT ..."
```

Useful queries:

```sql
-- Parent enrollments with drift
SELECT id, child_name, class_name, total_cost, total_paid, remaining_balance,
       effective_balance, payment_status, comp_percentage, comp_amount_cents
FROM program_enrollments
WHERE parent_id = <id>
ORDER BY id;

-- Payments (cash)
SELECT id, amount, status, stripe_payment_intent_id, enrollment_ids, payment_date
FROM payments
WHERE parent_id = <id>
ORDER BY created_at;

-- Unused approved credits
SELECT id, title, credit_amount_cents, used_amount_cents, status, description
FROM credits
WHERE user_id = <id> AND status IN ('approved', 'partially_used');
```

**Sanity check:** Sum of Stripe `payments.amount` + applied credits should cover `total_paid` across enrollments (allowing membership and comp rows).

## Applying missed credits (prod correction)

Pattern: dedicated script under `server/scripts/apply-*-credits-production.ts` (see Kari Wing, Jake Fabry).

1. Load target enrollments; compute owed via `computeEffectiveBalance`.
2. Load approved credits (FIFO if multiple).
3. Allocate credit cents to enrollments (oldest first unless case-specific).
4. In one transaction:
   - Insert synthetic `payments` row (`amount: 0`, `stripe_payment_intent_id: credit_correction_*`) for audit trail.
   - Insert `unified_credit_usage_logs` per credit consumed.
   - Update `credits.used_amount_cents` and `status` (`used` / `partially_used`).
   - Update enrollments: `total_paid`, `remaining_balance`, `payment_status`.
   - Insert `audit_logs` (`action_type: admin_balance_correction`).
5. Idempotency: skip if synthetic payment PI already exists.

| Script | Parent | Notes |
|--------|--------|-------|
| `apply-kari-wing-credits-production.ts` | 90 | FIFO aide credits → enr 272, 415 |
| `apply-jake-fabry-credits-production.ts` | 34 | Credit #34 ($810 spring comp) → enr 327–329 |

Dry-run first: `--dry-run`.

## Account correction email

After ledger fix, notify parent:

```bash
node scripts/with-prod-env.mjs npx tsx server/scripts/send-account-correction-email.ts \
  --parent-id <id> \
  --summary-file server/scripts/account-correction-summaries/<name>.json
```

Summaries: parent-friendly paragraphs (what was wrong, what we fixed, current balance). Script verifies balance via `buildFamilyBalanceEmailPayload` before send.

**Known non-blocker:** `email_log.created_at` missing on prod — Brevo send still succeeds; log write fails.

## Incidents (reference)

### Jake Fabry — parent 34 (2026-05-31)

- **Claim:** Paid in full.
- **Facts:** Mar 10 checkout PI `pi_3T9CLe…` **$1,890** for Spring enr **327–329** ($630/child). Admin credit **#34** ($810 “3 week comp”) approved same day but **never applied** (`used_amount_cents = 0`).
- **Symptom:** `total_paid = 63000`, `remaining_balance = 0`, **`effective_balance = 27000`** each → portal showed **$810** owed.
- **Fix:** `apply-jake-fabry-credits-production.ts` — $270 credit/enrollment → **$900 paid**, **$0 owed**, credit marked used. Email: `account-correction-summaries/jake-fabry.json`.

### Kari Wing — parent 90 (2026-05-30)

- Four approved aide credits ($1,056) never applied to class balances.
- Fix: `apply-kari-wing-credits-production.ts`; payment **#311**.

### Balance audit SQL pitfall (2026-05-30)

- `SUM(pe.effective_balance)` with `LEFT JOIN payments` multiplied balances by payment row count. Rank owing parents using enrollment subqueries only.

### Ghost abandoned checkout (2026-05-30)

- `pending_payment` + **$0 paid** + never attended → **cancel** enrollment; do not balance-correct or send correction email (Jackie Schleyer enr 433/434).

## Key files

| Area | Path |
|------|------|
| Effective balance | `shared/schema.ts` — `computeEffectiveBalance`, `resolveEnrollmentEffectiveBalance` |
| Cart / checkout pricing | `server/utils/cart-pricing.ts`, `server/api/stripe.ts` |
| Credit ledger | `server/services/` (FIFO consumption), `unified_credit_usage_logs` |
| Family balance (email/UI) | `server/lib/family-balance-email.ts` |
| Correction email | `server/lib/account-correction-email.ts`, `server/scripts/send-account-correction-email.ts` |
| Batch balance reminders | `server/scripts/send-balance-reminders-batch.ts` |
| PI reconcile | `server/scripts/reconcile-payment-intent-to-enrollments.ts` |
| Payment patterns skill | `.agents/skills/asa-payment-patterns/SKILL.md` |
| Credit skill | `.agents/skills/asa-credit-system/SKILL.md` |

## Common pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| Parent paid checkout but still shows balance | Approved credit not applied; or `total_paid` not updated after PI | Apply credit script; reconcile PI to enrollments |
| `remaining_balance = 0` but parent owes money | Stale `remaining_balance`; use `effective_balance` | Recompute / update both fields on correction |
| Checkout charged $630, `total_cost` still $900 | List price stored; credit or proration not on enrollment | Match ledger to cash + credits (see Jake Fabry) |
| Admin credit “used” in UI but `used_amount_cents = 0` | Credit approved manually, never linked at checkout | Post-hoc apply script + usage logs |
| Audit query shows huge total owed | JOIN inflation with `payments` | Aggregate enrollments only |
| Parent says paid; no `stripe_customer_id` on user | Customer id may live in enrollment `metadata.stripeCustomerId` | Check PI metadata and payments table |
