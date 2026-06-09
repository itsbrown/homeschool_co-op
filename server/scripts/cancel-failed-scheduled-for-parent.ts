/**
 * Cancel failed scheduled_payments so a parent can use Pay in full without
 * misleading "retry $106" rows in Upcoming.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/cancel-failed-scheduled-for-parent.ts --email parent@example.com
 *   CONFIRM_CANCEL_FAILED=1 node scripts/with-prod-env.mjs npx tsx server/scripts/cancel-failed-scheduled-for-parent.ts --email parent@example.com --apply
 */

import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { scheduledPayments } from '../../shared/schema';

function parseArgs(): { email: string; apply: boolean } {
  const args = process.argv.slice(2);
  let email = '';
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[++i].trim();
    } else if (args[i] === '--apply') {
      apply = true;
    }
  }
  if (!email) {
    console.error('Usage: --email parent@example.com [--apply]');
    console.error('Set CONFIRM_CANCEL_FAILED=1 with --apply on production.');
    process.exit(1);
  }
  return { email, apply };
}

async function main() {
  const { email, apply } = parseArgs();
  const db = await getDb();
  if (!db) {
    console.error('Database unavailable');
    process.exit(1);
  }

  const rows = await db
    .select({
      id: scheduledPayments.id,
      enrollmentId: scheduledPayments.enrollmentId,
      amount: scheduledPayments.amount,
      status: scheduledPayments.status,
      scheduledDate: scheduledPayments.scheduledDate,
    })
    .from(scheduledPayments)
    .where(
      sql`lower(trim(${scheduledPayments.parentEmail})) = lower(trim(${email}))`,
    );

  const failed = rows.filter((r) => String(r.status).toLowerCase() === 'failed');

  console.log(`Parent: ${email}`);
  console.log(`Failed scheduled payments: ${failed.length}`);
  for (const r of failed) {
    console.log(
      `  id=${r.id} enrollment=${r.enrollmentId} $${((r.amount ?? 0) / 100).toFixed(2)} due=${r.scheduledDate}`,
    );
  }

  if (failed.length === 0) {
    console.log('Nothing to cancel.');
    return;
  }

  if (!apply) {
    console.log('\nDry run — re-run with CONFIRM_CANCEL_FAILED=1 and --apply to cancel.');
    return;
  }

  if (process.env.CONFIRM_CANCEL_FAILED !== '1') {
    console.error('Refusing: set CONFIRM_CANCEL_FAILED=1');
    process.exit(1);
  }

  for (const r of failed) {
    await db
      .update(scheduledPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(scheduledPayments.id, r.id));
    console.log(`Cancelled scheduled_payment ${r.id}`);
  }

  console.log('Done. Parent can use Payments → Pay in full after deploy.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
