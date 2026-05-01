# Allocator Bug Remediation — Investigation Report

**Run ID:** `2538aef4-c7d2-497a-9af0-209ff6543e66`  
**Mode:** DRY-RUN (read-only scan against production)  
**Generated:** 2026-05-01T03:06:55.293Z  
**Source:** `scripts/fix-allocator-data-corruption.ts` planning algorithm against production read-replica  

## Background

The legacy "even-split" payment allocator (in `PaymentProcessorService.processPayment`) split multi-enrollment cart payments evenly across all selected enrollment IDs without considering each enrollment's outstanding balance. When a parent paid a cart that included at least one already-paid enrollment, the allocator left some sibling enrollments overpaid and others underpaid. The replacement balance-aware allocator (`allocatePaymentByBalance`, gated by the `BALANCE_AWARE_ALLOCATION` flag) prevents new damage from this date forward; this scan finds the damage already in production data.

Bug shape: `effective_balance < 0` on at least one enrollment **and** `effective_balance > 0` on at least one sibling enrollment under the same `parent_id`. **True pure allocator-bug victims** have a per-parent net effective balance of exactly `$0` — overpayment cancels underpayment. Parents with non-zero nets have additional damage from other causes (refunds, manual admin adjustments, comp changes, missed payments, etc.) and must NOT be auto-fixed by this script.

## Summary

- **Affected parents found in production:** 13
- **Pure allocator-bug victims (eligible for auto-fix):** 1
- **Investigation-only parents (NOT auto-fixed):** 12
- **Reallocations planned (across all eligible parents):** 6
- **Total dollars to be moved (across all eligible parents):** $1240.00
- **Planning algorithm:** proportional distribution per source via `allocatePaymentByBalance` (the same shared production helper used by the live balance-aware payment path) — BigInt floor + Hamilton's largest-remainder method, per-target caps respected, exact integer cents

### Aggregate misallocation across **all 13** affected parents

| Metric | Amount |
| --- | --- |
| Total overpayment (cash on enrollments that should not have it) | $7,645.85 |
| Total underpayment (enrollments still owed cash) | $14,855.19 |
| **Total absolute misallocation** | **$14,855.19** |
| Net family-wide balance (sum of all per-parent nets) | $7,209.34 (positive ⇒ school is owed in aggregate) |
| Reallocations the script will execute under `--apply` | 6 totalling $1,240.00 |

The eligible reallocations only fully heal Sara Puccia (parent #55, net $0). The remaining $13,615.19 of absolute misallocation lives across the 12 investigation-only parents and cannot be addressed by reallocation alone — each one needs human reconciliation (refund, charge, credit, or comp) before the script can safely heal them.

### Quick scan table

| Parent | Email | Enrollments | Overpayment | Underpayment | Net | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| #21 | kcrofoot92@gmail.com | 4 | $496.50 | $477.00 | -$19.50 | investigation only |
| #25 | mariahktropix02@gmail.com | 2 | $369.00 | $405.48 | $36.48 | investigation only |
| #27 | kelleydrewel@gmail.com | 3 | $225.00 | $1500.00 | $1275.00 | investigation only |
| #30 | ninaresser@yahoo.com | 4 | $120.85 | $1288.32 | $1167.47 | investigation only |
| #32 | kuhnsqueen@gmail.com | 4 | $600.00 | $1200.00 | $600.00 | investigation only |
| #47 | jessica@hutchinsbookkeeping.com | 5 | $724.50 | $1042.72 | $318.22 | investigation only |
| #48 | clarkhadleydc@gmail.com | 4 | $1142.50 | $967.50 | -$175.00 | investigation only |
| #49 | jasmineklimovich@yahoo.com | 3 | $258.75 | $1300.00 | $1041.25 | investigation only |
| #55 | kpdinvestors@gmail.com | 6 | $1240.00 | $1240.00 | $0.00 | **AUTO-FIX (Sara)** |
| #58 | beigel.shaley@gmail.com | 2 | $792.50 | $1054.17 | $261.67 | investigation only |
| #67 | verryluzpagan@yahoo.com | 4 | $991.25 | $1080.00 | $88.75 | investigation only |
| #70 | atierson2@gmail.com | 4 | $85.00 | $1500.00 | $1415.00 | investigation only |
| #98 | cmull728@yahoo.com | 4 | $600.00 | $1800.00 | $1200.00 | investigation only |

## Eligible parent — auto-fix plan

Only one parent (Sara Puccia, ID 55) matches the pure allocator-bug shape with a net of exactly `$0`. The other 12 affected parents have non-zero nets and require human investigation; they are deliberately excluded from the auto-fix path.

### Parent #55 — kpdinvestors@gmail.com

- **Enrollments:** 6
- **Overpayment:** $1240.00
- **Underpayment:** $1240.00
- **Net:** $0.00 ✅ (matches allocator-bug shape)

**Reallocation plan** (per-source proportional split via `allocatePaymentByBalance`, deterministic by enrollment id)

| From enrollment | To enrollment | Amount |
| --- | --- | --- |
| 187 | 381 | $220.00 |
| 187 | 382 | $220.00 |
| 188 | 381 | $220.00 |
| 188 | 382 | $220.00 |
| 191 | 381 | $180.00 |
| 191 | 382 | $180.00 |

Each source's outflow exactly equals its overpayment ($440 + $440 + $360 = $1240); each target's inflow exactly equals its underpayment ($620 + $620 = $1240). All six moves run inside a single Postgres transaction in `PaymentReallocationService.reallocateMany` — affected enrollment rows are locked with `SELECT ... FOR UPDATE`, the dry-run snapshot is field-by-field checked for drift inside the transaction (every relevant column: `total_paid`, `total_cost`, `comp_amount_cents`, `status`, derived `effective_balance`), the mandatory audit anchor is resolved (or backfilled into `stripe_payment_history` from the original `payments.id=212` row), all six `reallocation_out` / `reallocation_in` audit pairs are written, and the transaction commits — or rolls back the whole batch on any error.

**Enrollment state at scan time**

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 187 | Sebastian  Puccia | Tycoons | Brighton | $900.00 | $1340.00 | $0.00 | -$440.00 | enrolled |
| 188 | Salena Puccia | Tycoons | Brighton | $900.00 | $1340.00 | $0.00 | -$440.00 | enrolled |
| 191 | Silvie Puccia | Macaronis | $300.00 | $660.00 | $0.00 | -$360.00 | enrolled |
| 299 | Silvie Puccia | Macaronis | Brighton | Wednesday | $300.00 | $300.00 | $0.00 | $0.00 | enrolled |
| 381 | Sebastian  Puccia | Tycoons | Brighton | $1300.00 | $680.00 | $0.00 | $620.00 | enrolled |
| 382 | Salena Puccia | Tycoons | Brighton | $1300.00 | $680.00 | $0.00 | $620.00 | enrolled |

**Expected post-fix state**

| Enrollment | Total paid (after) | Effective balance (after) |
| --- | --- | --- |
| 187 | $900.00 | $0.00 |
| 188 | $900.00 | $0.00 |
| 191 | $300.00 | $0.00 |
| 299 | $300.00 | $0.00 |
| 381 | $1300.00 | $0.00 |
| 382 | $1300.00 | $0.00 |

**Sara-specific assertions** (run by the script after `--apply`):

- Enrollments #187, #188, #191, #381, #382 → `effective_balance = $0`
- Enrollment #299 → unchanged at `effective_balance = $0`
- Credit #32 ($360, status `approved`, `used = $0`) → untouched, still available

## Investigation-only parents (the other 12) — NOT auto-fixed

Each of these 12 parents shows the bug shape (`effective_balance < 0` next to `effective_balance > 0` under the same parent), but their per-parent net is not `$0`. That mismatch tells us additional damage exists beyond the even-split bug — refunds that were processed without updating cached totals, manual admin adjustments, comp changes after payment, missed installments, or some combination. An automated reallocation cannot safely heal a parent whose net is non-zero, because reallocation only moves money already received between sibling enrollments — it does not introduce or remove dollars. Each parent below needs a human admin to reconcile the net difference (refund/charge/credit) before any reallocation can land them at `$0` per enrollment.

Suggested investigation steps per parent:

1. Pull the `payments` rows and `payment_allocations` for the parent.
2. Pull any `refunds` or admin manual adjustments applied to the affected enrollments.
3. Reconcile the cash trail: total cash in (Stripe + manual + credits applied) minus total cash returned (refunds + credit reversals) versus total cost of all owed enrollments.
4. Decide whether the net is owed to the family (refund or credit) or owed to the school (additional charge or invoice).
5. After the net is resolved, the parent can be re-scanned and if they then show net = `$0`, the script can auto-fix them.

### Parent #21 — kcrofoot92@gmail.com

- **Enrollments:** 4
- **Overpayment:** $496.50
- **Underpayment:** $477.00
- **Net:** -$19.50 _(family appears overpaid in aggregate — likely owed a refund or credit reversal)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 104 | Amelia  Marek | Macaronis | Greece | Winter 2026 | $900.00 | $1396.50 | $0.00 | -$496.50 | enrolled |
| 105 | Olivia  Marek | Macaronis | Greece | Winter 2026 | $900.00 | $0.00 | $900.00 | $0.00 | enrolled |
| 389 | Amelia  Marek | Macaronis | Greece | $900.00 | $441.00 | $0.00 | $459.00 | enrolled |
| 390 | Olivia  Marek | Macaronis | Greece | $900.00 | $882.00 | $0.00 | $18.00 | pending_admin_approval |

### Parent #25 — mariahktropix02@gmail.com

- **Enrollments:** 2
- **Overpayment:** $369.00
- **Underpayment:** $405.48
- **Net:** $36.48 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 138 | Rocco DiSano | Yankee Doodle | Greece | Winter 2026 | $900.00 | $1269.00 | $0.00 | -$369.00 | enrolled |
| 331 | Rocco DiSano | Yankee Doodle | Greece | $900.00 | $494.52 | $0.00 | $405.48 | enrolled |

### Parent #27 — kelleydrewel@gmail.com

- **Enrollments:** 3
- **Overpayment:** $225.00
- **Underpayment:** $1500.00
- **Net:** $1275.00 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 126 | Arlo Drewel | Yankee Doodle | Greece | Winter 2026 | $900.00 | $1125.00 | $0.00 | -$225.00 | enrolled |
| 374 | Arlo Drewel | Yankee Doodle | Greece | $900.00 | $150.00 | $0.00 | $750.00 | enrolled |
| 385 | Otto Drewel | Macaronis | Greece | $900.00 | $150.00 | $0.00 | $750.00 | enrolled |

### Parent #30 — ninaresser@yahoo.com

- **Enrollments:** 4
- **Overpayment:** $120.85
- **Underpayment:** $1288.32
- **Net:** $1167.47 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 215 | Malia  Stone | Tycoons | Greece | $900.00 | $920.72 | $0.00 | -$20.72 | enrolled |
| 216 | Jett  Stone | Macaronis | Greece | $900.00 | $1000.13 | $0.00 | -$100.13 | enrolled |
| 391 | Malia  Stone | Tycoons | Brighton | $900.00 | $255.84 | $0.00 | $644.16 | enrolled |
| 392 | Jett  Stone | Macaronis | Brighton | $900.00 | $255.84 | $0.00 | $644.16 | enrolled |

### Parent #32 — kuhnsqueen@gmail.com

- **Enrollments:** 4
- **Overpayment:** $600.00
- **Underpayment:** $1200.00
- **Net:** $600.00 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 273 | Sydney Kuhn | Pioneers | Brighton | $900.00 | $600.00 | $900.00 | -$600.00 | enrolled |
| 274 | Cameron Kuhn | Pioneers | Brighton | $900.00 | $0.00 | $900.00 | $0.00 | enrolled |
| 420 | Cameron Kuhn | Pioneers | Brighton | $900.00 | $600.00 | $0.00 | $300.00 | enrolled |
| 421 | Sydney Kuhn | Patriots | Brighton | $900.00 | $0.00 | $0.00 | $900.00 | pending_payment |

### Parent #47 — jessica@hutchinsbookkeeping.com

- **Enrollments:** 5
- **Overpayment:** $724.50
- **Underpayment:** $1042.72
- **Net:** $318.22 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 173 | Emerson  Hutchins | Yankee Doodle | Brighton | $900.00 | $900.00 | $0.00 | $0.00 | enrolled |
| 175 | Asher Hutchins | Macaronis | Brighton | $900.00 | $0.00 | $900.00 | $0.00 | enrolled |
| 176 | Haven Hutchins | Macaronis | Brighton | $900.00 | $1624.50 | $0.00 | -$724.50 | enrolled |
| 342 | Haven Hutchins | Macaronis | Brighton | $900.00 | $532.28 | $0.00 | $367.72 | enrolled |
| 424 | Emerson  Hutchins | Yankee Doodle | Brighton | $900.00 | $225.00 | $0.00 | $675.00 | pending_payment |

### Parent #48 — clarkhadleydc@gmail.com

- **Enrollments:** 4
- **Overpayment:** $1142.50
- **Underpayment:** $967.50
- **Net:** -$175.00 _(family appears overpaid in aggregate — likely owed a refund or credit reversal)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 178 | Josephine Hadley | Yankee Doodle | Brighton | $900.00 | $1471.25 | $0.00 | -$571.25 | enrolled |
| 179 | James Hadley | Macaronis | Brighton | $900.00 | $1471.25 | $0.00 | -$571.25 | enrolled |
| 375 | Josephine Hadley | Yankee Doodle | Brighton | $1300.00 | $616.25 | $0.00 | $683.75 | enrolled |
| 376 | James Hadley | Macaronis | Brighton | $900.00 | $616.25 | $0.00 | $283.75 | enrolled |

### Parent #49 — jasmineklimovich@yahoo.com

- **Enrollments:** 3
- **Overpayment:** $258.75
- **Underpayment:** $1300.00
- **Net:** $1041.25 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 181 | Levi Klimovich | Yankee Doodle | Greece | $900.00 | $1158.75 | $0.00 | -$258.75 | enrolled |
| 182 | Elliana Klimovich | Tycoons | Greece | $900.00 | $900.00 | $0.00 | $0.00 | enrolled |
| 384 | Elliana Klimovich | Tycoons | Greece | $1300.00 | $0.00 | $0.00 | $1300.00 | pending_payment |

### Parent #58 — beigel.shaley@gmail.com

- **Enrollments:** 2
- **Overpayment:** $792.50
- **Underpayment:** $1054.17
- **Net:** $261.67 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 184 | Bronson Beigel | Yankee Doodle | Brighton | $900.00 | $1692.50 | $0.00 | -$792.50 | enrolled |
| 351 | Bronson Beigel | Yankee Doodle | Brighton | $1300.00 | $245.83 | $0.00 | $1054.17 | enrolled |

### Parent #67 — verryluzpagan@yahoo.com

- **Enrollments:** 4
- **Overpayment:** $991.25
- **Underpayment:** $1080.00
- **Net:** $88.75 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 196 | Easton  Carbonell | Tycoons | Greece | $1300.00 | $1630.41 | $0.00 | -$330.41 | enrolled |
| 197 | Chaska Carbonell | Yankee Doodle | Greece | $1300.00 | $1960.84 | $0.00 | -$660.84 | enrolled |
| 426 | Chaska Carbonell | Yankee Doodle | Greece | $900.00 | $360.00 | $0.00 | $540.00 | enrolled |
| 427 | Easton  Carbonell | Tycoons | Greece | $900.00 | $360.00 | $0.00 | $540.00 | enrolled |

### Parent #70 — atierson2@gmail.com

- **Enrollments:** 4
- **Overpayment:** $85.00
- **Underpayment:** $1500.00
- **Net:** $1415.00 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 202 | Blaire Thomas | Macaronis | Brighton | $900.00 | $942.50 | $0.00 | -$42.50 | enrolled |
| 203 | Hailey Thomas | Macaronis | Brighton | $900.00 | $942.50 | $0.00 | -$42.50 | enrolled |
| 338 | Blaire Thomas | Macaronis | Brighton | $900.00 | $150.00 | $0.00 | $750.00 | enrolled |
| 339 | Hailey Thomas | Macaronis | Brighton | $900.00 | $150.00 | $0.00 | $750.00 | enrolled |

### Parent #98 — cmull728@yahoo.com

- **Enrollments:** 4
- **Overpayment:** $600.00
- **Underpayment:** $1800.00
- **Net:** $1200.00 _(family appears underpaid in aggregate — likely owes money or missed an installment)_
- **Why not auto-fixed:** net_nonzero_other_damage_present

| Enrollment | Child | Class | Cost | Paid | Comp | Eff. balance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 275 | Daniel Pierce | Yankee Doodle | Brighton | $900.00 | $900.00 | $0.00 | $0.00 | pending_payment |
| 276 | Cristine Pierce | Yankee Doodle | Brighton | $900.00 | $1500.00 | $0.00 | -$600.00 | pending_payment |
| 417 | Daniel Pierce | Yankee Doodle | Brighton | $900.00 | $0.00 | $0.00 | $900.00 | pending_payment |
| 418 | Cristine Pierce | Yankee Doodle | Brighton | $900.00 | $0.00 | $0.00 | $900.00 | pending_payment |

## How to apply Sara's fix

From a context with **production write access** to `DATABASE_URL`:

```bash
# 1. Re-confirm dry-run plan (should match this report)
tsx scripts/fix-allocator-data-corruption.ts --parent-id 55

# 2. Apply (writes 6 reallocation pairs in a single transaction,
#    pauses/restores auto-pay, queues parent notification, asserts Sara final state)
tsx scripts/fix-allocator-data-corruption.ts --parent-id 55 --apply
```

The `--apply` run produces a fresh `scripts/reports/allocator-fix-<runId>.md` post-run report. Sara's `auto_pay_enabled` is currently `false` so the pause/restore step is a no-op for her run, but the code path is exercised correctly.

## Audit trail

Every reallocation issued by the script writes:

- A `reallocation_out` / `reallocation_in` pair into `payment_allocations` (audit pair is **mandatory** — the service first looks for an anchor in existing `payment_allocations`, otherwise backfills one into `stripe_payment_history` from the original `payments` row, otherwise aborts the entire batch with `NO_AUDIT_ANCHOR_AVAILABLE` rather than silently skipping the audit ledger).
- A `paymentReallocationHistory` entry into both source and target enrollment's `metadata` JSONB column.
- An `adminComment` containing the script run UUID so future auditors can trace exactly which run touched which money. Template: `"Allocator bug remediation, script run {runId}. Mar 25 2026 even-split bug caused payment to land on already-paid enrollment(s); reallocating from enrollment {sourceId} to enrollment {targetId}. See post-run report for full per-parent diff."`
- A queued in-app notification to the parent: *"We corrected an error in how a recent payment was applied across your enrollments. Your total paid is unchanged; your balance now reflects the correct amount. No action is needed."*
