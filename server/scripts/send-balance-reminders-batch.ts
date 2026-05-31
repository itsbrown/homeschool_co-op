/**
 * Send consolidated balance reminder emails (amount due + pay link) to families.
 *
 * Production:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/send-balance-reminders-batch.ts
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/send-balance-reminders-batch.ts --dry-run
 */

import { getDb } from '../db';
import { users } from '../../shared/schema';
import { inArray, sql } from 'drizzle-orm';
import { sendFamilyBalanceEmail } from '../lib/family-balance-email';

/** Explicit exclusions + admin/test accounts */
const EXCLUDE_PARENT_IDS = new Set([
  3, // coreycreates
  5, // admin contact
  29, // Mark Corcoran
  121, // Tamir Sartena
  135, // Jennifer Pastorella
  145, // Elisabeth Ballou
]);

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

async function getTargetParentIds(): Promise<number[]> {
  const db = await getDb();
  const result = await db.execute(sql`
    WITH class_owed AS (
      SELECT pe.parent_id, SUM(COALESCE(pe.effective_balance, 0)) AS class_cents
      FROM program_enrollments pe
      WHERE pe.status NOT IN ('cancelled', 'waitlist', 'withdrawn', 'failed', 'completed')
        AND COALESCE(pe.effective_balance, 0) > 0
      GROUP BY pe.parent_id
    ),
    membership_owed AS (
      SELECT me.parent_user_id AS parent_id, SUM(COALESCE(me.remaining_balance, 0)) AS membership_cents
      FROM membership_enrollments me
      WHERE COALESCE(me.remaining_balance, 0) > 0
        AND me.status NOT IN ('cancelled', 'void', 'withdrawn')
      GROUP BY me.parent_user_id
    ),
    fall_parents AS (
      SELECT DISTINCT parent_id FROM program_enrollments
      WHERE class_name IN ('Fall 2026 - Full Day', 'Fall 2026 - Half Day')
        AND status NOT IN ('cancelled', 'withdrawn', 'failed')
    )
    SELECT u.id::int AS id
    FROM users u
    LEFT JOIN class_owed c ON c.parent_id = u.id
    LEFT JOIN membership_owed m ON m.parent_id = u.id
    WHERE COALESCE(c.class_cents, 0) + COALESCE(m.membership_cents, 0) > 0
      AND u.email NOT LIKE 'fin_parent_%@test.com'
      AND u.id NOT IN (SELECT parent_id FROM fall_parents)
    ORDER BY u.id
  `);

  const rows = (result as { rows?: { id: number }[] }).rows ?? (result as unknown as { id: number }[]);

  return rows
    .map((r) => Number(r.id))
    .filter((id) => Number.isFinite(id) && id > 0 && !EXCLUDE_PARENT_IDS.has(id));
}

async function main() {
  const dryRun = parseDryRun(process.argv.slice(2));
  const parentIds = await getTargetParentIds();

  if (parentIds.length === 0) {
    console.log('No target parents found.');
    return;
  }

  const db = await getDb();
  const parentRows = await db
    .select({ id: users.id, email: users.email, name: users.name, schoolId: users.schoolId })
    .from(users)
    .where(inArray(users.id, parentIds));

  console.log(`Balance reminders — ${parentRows.length} families (${dryRun ? 'DRY RUN' : 'SEND'})`);
  console.log('='.repeat(70));

  if (!dryRun && !process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not configured.');
    process.exit(1);
  }

  let sent = 0;
  let failed = 0;

  for (const parent of parentRows) {
    const schoolId = parent.schoolId ?? 1;
    const label = `${parent.name || parent.email} (${parent.email})`;

    if (dryRun) {
      const { buildFamilyBalanceEmailPayload } = await import('../lib/family-balance-email');
      const payload = await buildFamilyBalanceEmailPayload(schoolId, parent.email!);
      if (!payload) {
        console.log(`SKIP ${label} — no balance payload`);
        continue;
      }
      console.log(
        `WOULD SEND ${label} — $${(payload.totalAmountCents / 100).toFixed(2)} (${payload.lineItems.length} items)`,
      );
      sent++;
      continue;
    }

    const result = await sendFamilyBalanceEmail(schoolId, parent.email!, undefined);
    if (result.success) {
      console.log(`SENT ${label} — ${result.paymentCount} item(s)`);
      sent++;
    } else {
      console.error(`FAIL ${label} — ${result.error ?? 'unknown'}`);
      failed++;
    }

    // Gentle pacing for Brevo
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('='.repeat(70));
  console.log(`Done: ${sent} sent${dryRun ? ' (dry-run)' : ''}, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
