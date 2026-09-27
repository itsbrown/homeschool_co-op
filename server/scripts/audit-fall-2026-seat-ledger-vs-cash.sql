-- Read-only: per family, Fall 2026 (session 2) seat total_paid vs money actually received.
-- Run: node server/scripts/prod-query.mjs "$(cat server/scripts/audit-fall-2026-seat-ledger-vs-cash.sql)"
-- money = completed payments (refund rows negative) whose enrollment ids are all this family's
-- session-2 seats, minus allocationBreakdown.membershipCents. Payments mixing session-2 seats with
-- other enrollments are counted separately (mixed_cents) because the split is not stored.
WITH seats AS (
  SELECT pe.id, pe.parent_id, pe.total_paid, pe.status
  FROM program_enrollments pe
  WHERE pe.session_id = 2 AND pe.enrollment_version = 'v2'
),
pay_raw AS (
  SELECT p.id, p.amount,
    COALESCE((p.metadata->'allocationBreakdown'->>'membershipCents')::int, 0) AS membership_cents,
    ARRAY(
      SELECT DISTINCT e::int FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(p.enrollment_ids) = 'array' AND jsonb_array_length(p.enrollment_ids) > 0 THEN p.enrollment_ids
          WHEN jsonb_typeof(p.metadata->'enrollmentIds') = 'array' THEN p.metadata->'enrollmentIds'
          WHEN jsonb_typeof(p.metadata->'enrollmentIds') = 'string' AND (p.metadata->>'enrollmentIds') LIKE '[%' THEN (p.metadata->>'enrollmentIds')::jsonb
          ELSE '[]'::jsonb
        END
      ) e
    ) AS eids,
    NULLIF(p.metadata->>'scheduledPaymentId', '')::int AS sp_id
  FROM payments p
  -- Originals keep counting after a refund; the negative refund row offsets them.
  WHERE p.status IN ('completed', 'succeeded', 'refunded', 'partially_refunded')
),
pay AS (
  SELECT r.id, r.amount, r.membership_cents,
    CASE
      WHEN cardinality(r.eids) > 0 THEN r.eids
      WHEN sp.id IS NOT NULL AND jsonb_typeof(sp.metadata->'enrollmentIds') = 'array' AND jsonb_array_length(sp.metadata->'enrollmentIds') > 0
        THEN ARRAY(SELECT DISTINCT e::int FROM jsonb_array_elements_text(sp.metadata->'enrollmentIds') e)
      WHEN sp.id IS NOT NULL THEN ARRAY[sp.enrollment_id]
      ELSE r.eids
    END AS eids
  FROM pay_raw r
  LEFT JOIN scheduled_payments sp ON sp.id = r.sp_id
),
pay_fam AS (
  SELECT pay.*, s.parent_id,
    (SELECT count(*) FROM unnest(pay.eids) e WHERE e NOT IN (SELECT id FROM seats s2 WHERE s2.parent_id = s.parent_id)) AS foreign_ids
  FROM pay
  JOIN LATERAL (SELECT DISTINCT parent_id FROM seats WHERE seats.id = ANY(pay.eids)) s ON true
),
fam AS (
  SELECT s.parent_id,
    SUM(s.total_paid) AS ledger_paid,
    COUNT(*) FILTER (WHERE s.total_paid > 0) AS paid_seats
  FROM seats s GROUP BY s.parent_id
),
money AS (
  SELECT parent_id,
    SUM(amount - membership_cents) FILTER (WHERE foreign_ids = 0) AS clean_cents,
    SUM(amount) FILTER (WHERE foreign_ids > 0) AS mixed_cents,
    COUNT(*) AS payment_rows
  FROM pay_fam GROUP BY parent_id
),
creds AS (
  SELECT user_id, SUM(used_amount_cents) AS credits_used FROM credits GROUP BY user_id
),
sp AS (
  SELECT parent_id,
    COUNT(*) FILTER (WHERE status = 'completed' AND charged_by = 'parent_manual') AS manual_completed,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed
  FROM scheduled_payments
  WHERE enrollment_id IN (SELECT id FROM seats)
  GROUP BY parent_id
)
SELECT f.parent_id, u.email,
  f.ledger_paid::bigint,
  COALESCE(m.clean_cents, 0)::bigint AS money_cents,
  (f.ledger_paid - COALESCE(m.clean_cents, 0))::bigint AS ledger_minus_money,
  COALESCE(m.mixed_cents, 0)::bigint AS mixed_cents,
  COALESCE(c.credits_used, 0)::bigint AS credits_used,
  COALESCE(sp.completed, 0) AS sp_completed,
  COALESCE(sp.manual_completed, 0) AS sp_manual_completed
FROM fam f
JOIN users u ON u.id = f.parent_id
LEFT JOIN money m ON m.parent_id = f.parent_id
LEFT JOIN creds c ON c.user_id = f.parent_id
LEFT JOIN sp ON sp.parent_id = f.parent_id
WHERE f.ledger_paid <> COALESCE(m.clean_cents, 0)
ORDER BY (f.ledger_paid - COALESCE(m.clean_cents, 0)) DESC;
