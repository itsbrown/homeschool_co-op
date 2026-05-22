# Runbook: production backfill after parent / payment fixes

Use after deploying `main` (includes cart exclusion, checkout plan sync, profile/school scope).

**Order:** deploy + restart → optional SQL backfills → smoke tests.

Do **not** run `db:push` / `drizzle-kit push` on production.

---

## 1. Deploy application code (required)

```bash
git fetch origin
git reset --hard origin/main   # if no Repl-only commits to keep
```

**Stop → Run** on Replit (or restart your production process).

Optional verify:

```bash
node scripts/post-merge-replit-check.mjs
```

### No database backfill needed (code-only)

| Fix | Backfill? |
|-----|-----------|
| Cart hides payment-plan enrollments | No — computed at runtime from enrollments + `scheduled_payments` |
| Dashboard “next payment due” | No |
| Stale browser cart (`localStorage`) | No — parents hard-refresh or sign out/in after deploy |
| New checkouts record correct `payment_plan` | No — forward-only after deploy |

---

## 2. Payment plan column backfill (recommended if biweekly parents show `full_payment`)

**When:** Enrollments have `payment_plan = 'full_payment'` (or `metadata.paymentPlan = 'full'`) but `scheduled_payments` rows exist with `metadata.paymentPlan` in `biweekly` / `deposit` / `split` and `total_installments > 1`.

Script: [`server/scripts/backfill-enrollment-payment-plan-from-schedule.sql`](../../../server/scripts/backfill-enrollment-payment-plan-from-schedule.sql)

### 2a. Preview affected rows

```sql
-- Enrollments on installment schedules but labeled full_payment
SELECT
  e.id,
  e.parent_email,
  e.class_name,
  e.payment_plan,
  e.payment_frequency,
  e.payment_status,
  e.total_paid,
  e.metadata->>'paymentPlan' AS meta_plan,
  e.metadata->>'initialPaymentIntentId' AS initial_pi,
  sp.id AS scheduled_payment_id,
  sp.status AS sp_status,
  sp.total_installments,
  sp.metadata->>'paymentPlan' AS sp_plan
FROM program_enrollments e
JOIN scheduled_payments sp ON (
  e.id = sp.enrollment_id
  OR e.id IN (
    SELECT jsonb_array_elements_text(sp.metadata->'enrollmentIds')::int
  )
)
WHERE e.payment_plan = 'full_payment'
  AND sp.status IN ('pending', 'processing', 'failed')
  AND sp.total_installments > 1
  AND COALESCE(sp.metadata->>'paymentPlan', '') IN ('biweekly', 'deposit', 'split')
ORDER BY e.parent_email, e.id
LIMIT 200;
```

### 2b. Apply bulk fix (transaction)

```sql
BEGIN;

UPDATE program_enrollments e
SET
  payment_plan = CASE sp.plan
    WHEN 'biweekly' THEN 'biweekly'
    WHEN 'deposit' THEN 'deposit_only'
    WHEN 'split' THEN 'custom'
    ELSE e.payment_plan
  END,
  payment_frequency = CASE sp.plan
    WHEN 'biweekly' THEN 'biweekly'
    ELSE e.payment_frequency
  END,
  payment_status = CASE
    WHEN COALESCE(e.total_paid, 0) > 0 AND sp.plan <> 'full' THEN 'partial_payment'
    ELSE e.payment_status
  END,
  metadata = jsonb_set(
    COALESCE(e.metadata, '{}'::jsonb),
    '{paymentPlan}',
    to_jsonb(sp.plan::text),
    true
  ),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (eid)
    eid,
    lower(trim(COALESCE(sp.metadata->>'paymentPlan', 'biweekly'))) AS plan
  FROM scheduled_payments sp
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(sp.metadata->'enrollmentIds') = 'array'
        THEN sp.metadata->'enrollmentIds'
        ELSE jsonb_build_array(sp.enrollment_id::text)
      END
    )::int AS eid
  ) ids
  WHERE sp.status IN ('pending', 'processing', 'failed')
    AND sp.total_installments > 1
    AND COALESCE(sp.metadata->>'paymentPlan', '') IN ('biweekly', 'deposit', 'split')
) sp
WHERE e.id = sp.eid
  AND e.payment_plan = 'full_payment';

-- Review row count in psql before COMMIT
-- SELECT id, parent_email, payment_plan, payment_frequency, metadata->>'paymentPlan'
-- FROM program_enrollments WHERE updated_at > NOW() - INTERVAL '1 minute';

COMMIT;
```

### 2c. Single-family fix (example)

```sql
BEGIN;

UPDATE program_enrollments e
SET
  payment_plan = 'biweekly',
  payment_frequency = 'biweekly',
  payment_status = 'partial_payment',
  metadata = jsonb_set(COALESCE(e.metadata, '{}'::jsonb), '{paymentPlan}', '"biweekly"'::jsonb, true),
  updated_at = NOW()
WHERE lower(trim(e.parent_email)) = 'jocimarie@gmail.com'
  AND e.metadata->>'initialPaymentIntentId' = 'pi_3TZqzVRDKItA2gz00zwOa0LK'
  AND e.payment_plan = 'full_payment';

COMMIT;
```

---

## 3. Profile + school scope backfill (optional)

**When:** Admin **Access Denied** on parent profile, credit lookup misses parents, Settings names empty (optional if API fallback works).

Runbook: [backfill-profile-school-production.md](./backfill-profile-school-production.md)

```bash
psql "$DATABASE_URL" -f server/scripts/backfill-profile-and-school-scope.sql
```

Or run inside Supabase SQL editor with `BEGIN` / `COMMIT` from the script.

---

## 4. Smoke tests after backfill

| Actor | Check |
|-------|--------|
| Parent on biweekly plan | Cart empty; dashboard shows next installment; **Payments → Upcoming** |
| Parent | Hard refresh after deploy (clears stale cart cache) |
| School admin | Users → parent profile loads; manual credit search finds parent |
| Parent | Settings shows first/last name (or after one save) |

---

## 5. Rollback

- SQL updates are row-level; restore from backup/snapshot if needed.
- Redeploy previous git SHA if code regression.

---

## Quick reference: scripts on disk

| Script | Purpose |
|--------|---------|
| `server/scripts/backfill-enrollment-payment-plan-from-schedule.sql` | Payment plan / metadata alignment |
| `server/scripts/backfill-profile-and-school-scope.sql` | Names + `school_id` / `user_roles` |
| `server/scripts/backfill-child-school-from-parent.sql` | Children `school_id` only (subset of #2) |
