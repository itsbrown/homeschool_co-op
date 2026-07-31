/**
 * Read-only audit: Free After Threshold candidates on the connected DB.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/audit-free-after-candidates.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  ssl: "require",
});

async function main() {
  const schools = await sql`
    SELECT id, name, free_after_threshold_enabled, free_after_threshold
    FROM schools
    ORDER BY id
  `;
  console.log("=== SCHOOLS FAT CONFIG ===");
  console.log(JSON.stringify(schools, null, 2));

  const families = await sql`
    WITH class_enrollments AS (
      SELECT
        pe.id,
        pe.parent_id,
        pe.parent_email,
        pe.school_id,
        pe.child_id,
        pe.child_name,
        pe.class_name,
        pe.status,
        pe.total_cost,
        pe.total_paid,
        pe.comp_amount_cents,
        pe.comp_reason,
        pe.session_id,
        GREATEST(
          pe.total_cost - COALESCE(pe.total_paid, 0) - COALESCE(pe.comp_amount_cents, 0),
          0
        ) AS owed_cents
      FROM program_enrollments pe
      WHERE pe.status NOT IN ('cancelled', 'canceled', 'withdrawn', 'failed')
        AND COALESCE(pe.total_cost, 0) > 0
        AND COALESCE(pe.placement_source, '') IS DISTINCT FROM 'grade'
        AND pe.class_name NOT ILIKE '%membership%'
        AND (
          pe.class_id IS NOT NULL
          OR pe.marketplace_class_id IS NOT NULL
          OR pe.program_id IS NOT NULL
        )
    ),
    family_agg AS (
      SELECT
        ce.parent_id,
        MAX(ce.parent_email) AS parent_email,
        ce.school_id,
        COUNT(DISTINCT ce.child_id) AS unique_children,
        COUNT(*)::int AS enrollment_rows,
        SUM(ce.total_cost)::bigint AS total_cost_cents,
        SUM(ce.total_paid)::bigint AS total_paid_cents,
        SUM(ce.comp_amount_cents)::bigint AS total_comp_cents,
        SUM(ce.owed_cents)::bigint AS family_owed_cents,
        SUM(
          CASE WHEN ce.comp_reason ILIKE '%free after%' THEN 1 ELSE 0 END
        )::int AS fat_comp_rows,
        SUM(
          CASE WHEN COALESCE(ce.comp_amount_cents, 0) > 0 THEN 1 ELSE 0 END
        )::int AS any_comp_rows,
        ARRAY_AGG(DISTINCT ce.child_name ORDER BY ce.child_name) AS children,
        MIN(ce.total_cost) AS cheapest_line_cents
      FROM class_enrollments ce
      GROUP BY ce.parent_id, ce.school_id
    )
    SELECT
      f.*,
      s.name AS school_name,
      s.free_after_threshold_enabled,
      s.free_after_threshold,
      GREATEST(
        f.unique_children - COALESCE(s.free_after_threshold, 3),
        0
      ) AS free_count_if_one_cart
    FROM family_agg f
    JOIN schools s ON s.id = f.school_id
    WHERE f.unique_children > COALESCE(s.free_after_threshold, 3)
    ORDER BY
      s.free_after_threshold_enabled DESC,
      f.unique_children DESC,
      f.family_owed_cents DESC
  `;

  console.log("\n=== FAMILIES WITH unique_children > threshold ===");
  console.log(JSON.stringify(families, null, 2));

  if (families.length > 0) {
    const parentIds = families.map((f) => f.parent_id as number);
    const details = await sql`
      SELECT
        pe.parent_id,
        pe.parent_email,
        pe.id AS enrollment_id,
        pe.child_name,
        pe.class_name,
        pe.status,
        pe.session_id,
        pe.total_cost,
        pe.total_paid,
        pe.comp_amount_cents,
        pe.comp_reason,
        GREATEST(
          pe.total_cost - COALESCE(pe.total_paid, 0) - COALESCE(pe.comp_amount_cents, 0),
          0
        ) AS owed_cents
      FROM program_enrollments pe
      WHERE pe.parent_id = ANY(${parentIds})
        AND pe.status NOT IN ('cancelled', 'canceled', 'withdrawn', 'failed')
        AND COALESCE(pe.total_cost, 0) > 0
        AND COALESCE(pe.placement_source, '') IS DISTINCT FROM 'grade'
        AND pe.class_name NOT ILIKE '%membership%'
      ORDER BY pe.parent_id, pe.total_cost ASC, pe.id
    `;
    console.log("\n=== ENROLLMENT DETAIL (cheapest first) ===");
    console.log(JSON.stringify(details, null, 2));
  }

  const fatPayments = await sql`
    SELECT
      p.id,
      p.parent_id,
      p.parent_email,
      p.amount,
      p.payment_date,
      p.stripe_payment_intent_id,
      p.metadata->'discountSnapshot' AS discount_snapshot
    FROM payments p
    WHERE p.metadata ? 'discountSnapshot'
      AND (
        COALESCE((p.metadata->'discountSnapshot'->>'freeAfterThree')::numeric, 0) > 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            COALESCE(p.metadata->'discountSnapshot'->'appliedDiscounts', '[]'::jsonb)
          ) d
          WHERE d->>'source' = 'free_after_threshold'
        )
      )
    ORDER BY p.payment_date DESC NULLS LAST
    LIMIT 50
  `;
  console.log("\n=== PAYMENTS WITH FAT discountSnapshot ===");
  console.log(JSON.stringify(fatPayments, null, 2));

  const fatComps = await sql`
    SELECT
      id,
      parent_id,
      parent_email,
      child_name,
      class_name,
      total_cost,
      comp_amount_cents,
      comp_reason,
      status
    FROM program_enrollments
    WHERE comp_reason ILIKE '%free after%'
    ORDER BY id
  `;
  console.log("\n=== ENROLLMENTS WITH Free After COMP ===");
  console.log(JSON.stringify(fatComps, null, 2));

  // Soft candidates at ASA (school 2) even if FAT flag off — household size only
  const soft = await sql`
    SELECT
      pe.parent_id,
      MAX(pe.parent_email) AS parent_email,
      COUNT(DISTINCT pe.child_id)::int AS unique_children,
      COUNT(*)::int AS enrollment_rows,
      ARRAY_AGG(DISTINCT pe.child_name ORDER BY pe.child_name) AS children,
      SUM(
        GREATEST(
          pe.total_cost - COALESCE(pe.total_paid, 0) - COALESCE(pe.comp_amount_cents, 0),
          0
        )
      )::bigint AS family_owed_cents
    FROM program_enrollments pe
    WHERE pe.school_id = 2
      AND pe.status NOT IN ('cancelled', 'canceled', 'withdrawn', 'failed')
      AND COALESCE(pe.total_cost, 0) > 0
      AND COALESCE(pe.placement_source, '') IS DISTINCT FROM 'grade'
      AND pe.class_name NOT ILIKE '%membership%'
    GROUP BY pe.parent_id
    HAVING COUNT(DISTINCT pe.child_id) >= 4
    ORDER BY COUNT(DISTINCT pe.child_id) DESC, family_owed_cents DESC
  `;
  console.log("\n=== SOFT: school 2 families with 4+ unique kids (any FAT flag) ===");
  console.log(JSON.stringify(soft, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
