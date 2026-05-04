#!/usr/bin/env tsx
/**
 * CI drift check for program_enrollments.effective_balance.
 *
 * Asserts that every row's stored effective_balance matches the canonical
 * formula from ARCHITECTURAL_PATTERNS.md §12:
 *
 *   GREATEST(0, total_cost - total_paid - COALESCE(comp_amount_cents, 0))
 *
 * Exit codes:
 *   0 — drift = 0 (passing)
 *   1 — drift > 0 (failing — restart the app to run the backfill in
 *       server/init-db.ts, or apply the manual repair in
 *       .agents/skills/asa-database-patterns/SKILL.md "Generated Columns
 *       and Derived Values")
 *   2 — DATABASE_URL missing or DB unreachable
 */
import { Pool } from 'pg';
import { getDbSslConfig, getNormalizedDatabaseUrl } from '../server/lib/database-url';

async function main() {
  const url = getNormalizedDatabaseUrl();
  if (!url) {
    console.error('❌ DATABASE_URL is not set; cannot run effective_balance drift check.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: url, ssl: getDbSslConfig(url) });
  try {
    const { rows } = await pool.query<{ total: number; drift: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE effective_balance IS DISTINCT FROM GREATEST(
            0,
            COALESCE(total_cost, 0) - COALESCE(total_paid, 0) - COALESCE(comp_amount_cents, 0)
          )
        )::int AS drift
      FROM program_enrollments;
    `);
    const { total, drift } = rows[0];
    console.log(`effective_balance drift check: total=${total}, drift=${drift}`);

    if (drift > 0) {
      console.error(`❌ Drift detected: ${drift}/${total} program_enrollments rows do not match the canonical formula.`);
      console.error('   To repair, restart the app (server/init-db.ts auto-backfills) or run:');
      console.error('     UPDATE program_enrollments SET total_paid = total_paid');
      console.error('     WHERE effective_balance IS DISTINCT FROM GREATEST(0,');
      console.error('       COALESCE(total_cost,0) - COALESCE(total_paid,0) - COALESCE(comp_amount_cents,0));');
      process.exit(1);
    }
    console.log('✅ effective_balance drift = 0');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ effective_balance drift check failed to run:', err?.message ?? err);
    process.exit(2);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
