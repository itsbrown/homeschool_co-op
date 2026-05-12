# Production balance dashboard triage

Admin “balance issues” (e.g. cached vs effective, missing schedules, orphans) are **server-side consistency** signals surfaced in UI. Triage in this order to avoid false fixes.

## Symptom clusters

| ID | Symptom | Likely cause |
|----|---------|--------------|
| **B1** | Orphaned scheduled payment — enrollment id no longer exists | `scheduled_payments` rows referencing removed/cancelled/replaced `program_enrollments`; stale FK or missing cascade. |
| **B2** | Missing scheduled payments — owed on plan, zero pending rows | Schedule generator not run after enrollment/plan change; rows exist but filtered (status); or creation failed silently. |
| **B3** | Past-due but still `pending` | Automation has not moved to `overdue` / processing; or intentional until autopay runs — confirm product rules. |
| **B4** | Cached `remaining_balance` vs `effectiveBalance` | Denormalized column out of sync with payments/credits/reallocations; recompute path missing after writes. |
| **B5** | Sum(pending schedules) vs effective balance | Orphans double-counted (B1); credit netting only in one side; definition mismatch. |

## Triage order

1. **B1** — Reduce noise that poisons B5 totals.
2. **B4** — Prove drift with SQL on a **small sample** before bulk recompute.
3. **B2** — Deep-dive one enrollment end-to-end (DB + creation path).
4. **B3** — Confirm lifecycle rules vs UI wording.
5. **B5** — After B1/B4, align definitions or exclude cancelled rows from sums.

---

## B1 — Orphaned scheduled payments

**Goal:** List rows whose enrollment no longer exists for the same school context.

Template (adjust table/column names to match production schema — often `scheduled_payments` + `program_enrollments`):

```sql
-- Orphans: scheduled payment points at missing enrollment
SELECT sp.id AS scheduled_payment_id,
       sp.enrollment_id,
       sp.amount,
       sp.status,
       sp.parent_email
FROM scheduled_payments sp
LEFT JOIN program_enrollments pe ON pe.id = sp.enrollment_id
WHERE pe.id IS NULL
   OR pe.status IN ('cancelled', 'withdrawn')  -- tighten per product rules
ORDER BY sp.id
LIMIT 200;
```

**Remediation policy (choose explicitly):**

- **Cancel** orphan rows (`status = 'cancelled'` or equivalent) with audit note; or
- **Re-link** if a replacement enrollment id is known (rare; needs human verification); or
- **Skip** in dashboards only after DB cleanup — do not hide without fixing data.

Record counts + sample IDs in `docs/audit/<task>-evidence/` for any production remediation task.

---

## B4 — Cached balance mismatch

**Goal:** For 3–5 sample enrollments flagged by the UI, compare:

- `program_enrollments.total_cost`, `total_paid`, `remaining_balance` (stored)
- Computed: `GREATEST(0, total_cost - total_paid)` in cents if stored as dollars adjust accordingly
- Sum of applied payments from payment history if authoritative

Template:

```sql
SELECT id,
       total_cost,
       total_paid,
       remaining_balance,
       (COALESCE(total_cost,0) - COALESCE(total_paid,0)) AS computed_remaining
FROM program_enrollments
WHERE id = :enrollment_id;
```

**Interpretation:**

- If `remaining_balance` ≠ computed and payments are complete → **safe recompute** candidate (batch job + webhook/post-payment hook).
- If `effectiveBalance` is **negative** (credit) but `remaining_balance` is 0 → **credit semantics** — do not zero remaining without applying credit rules; document `effectiveBalance` definition.

---

## B2 — Missing scheduled payments

For one flagged enrollment:

```sql
SELECT * FROM scheduled_payments
WHERE enrollment_id = :enrollment_id
ORDER BY scheduled_date, id;
```

Check statuses (`pending`, `completed`, `cancelled`, …). If no rows: trace code path that creates installments (checkout success, admin plan save, migration). See server scheduled-payment APIs and storage layer.

---

## B5 — Scheduled total vs effective

After B1 cleanup, re-run dashboard or:

```sql
SELECT enrollment_id,
       SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending_sum
FROM scheduled_payments
WHERE enrollment_id = :id
GROUP BY enrollment_id;
```

Compare to `effectiveBalance` from the same source the UI uses. If definitions differ, document in one place: *effective = net of credits; schedule sum = gross installments*, etc.

---

## Code areas (reference)

When implementing fixes, start from:

- [server/api/scheduled-payments.ts](../server/api/scheduled-payments.ts)
- [server/services/scheduled-payment-reminders.ts](../server/services/scheduled-payment-reminders.ts)
- [server/api/billing.ts](../server/api/billing.ts)
- [server/dbStorage.ts](../server/dbStorage.ts), [server/storage.ts](../server/storage.ts)
- [server/webhook-handler.ts](../server/webhook-handler.ts)

Locate the **admin balance audit** route/client by searching the production branch for strings shown in the UI (e.g. “Cached remaining_balance”, “Orphaned scheduled payment”).

---

## Suggested follow-up tasks (Replit / GitHub)

1. **Data:** Orphan `scheduled_payments` export + remediation playbook (dry-run SQL in `docs/audit/`).
2. **Code:** Recompute `remaining_balance` from `total_cost` / `total_paid` after successful payment / reallocation (if B4 confirms drift).
3. **Spec:** Single doc defining `effectiveBalance` vs sum(pending schedules) to resolve B5 false positives.
