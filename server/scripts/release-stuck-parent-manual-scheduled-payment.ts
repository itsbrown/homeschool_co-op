/**
 * Release scheduled_payments stuck in processing + parent_manual so Pay Now works again.
 * Prefer the fleet audit script for bulk checks:
 *   server/scripts/audit-stuck-parent-manual-installments.ts
 *
 * Dry run:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/release-stuck-parent-manual-scheduled-payment.ts --email parent@example.com
 *
 * Apply (production):
 *   CONFIRM_RELEASE_STUCK=1 node scripts/with-prod-env.mjs npx tsx server/scripts/release-stuck-parent-manual-scheduled-payment.ts --email parent@example.com --apply
 */

import {
  findStuckParentManualInstallments,
  releaseStuckParentManualInstallment,
  PARENT_MANUAL_STUCK_MINUTES,
} from '../lib/stuck-parent-manual-installments';

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
    process.exit(1);
  }
  return { email, apply };
}

async function main() {
  const { email, apply } = parseArgs();
  const findOpts = {
    processingOlderThanMinutes: 0,
    includeFailedWithPi: true,
    onlyOwingEnrollments: true,
  };

  const allRows = await findStuckParentManualInstallments(findOpts);
  const stuck = allRows.filter(
    (r) => r.parentEmail.trim().toLowerCase() === email.trim().toLowerCase(),
  );

  console.log(`Parent: ${email}`);
  console.log(`Stuck parent_manual rows: ${stuck.length}`);
  for (const r of stuck) {
    console.log(
      `  id=${r.id} enrollment=${r.enrollmentId} $${((r.amount ?? 0) / 100).toFixed(2)} pi=${r.stripePaymentIntentId ?? '(none)'} status=${r.status}`,
    );
  }

  if (stuck.length === 0) {
    console.log('Nothing to release.');
    return;
  }

  if (!apply) {
    console.log(
      `\nDry run — re-run with CONFIRM_RELEASE_STUCK=1 and --apply to release (threshold ${PARENT_MANUAL_STUCK_MINUTES}m ignored for single-parent release).`,
    );
    return;
  }

  if (process.env.CONFIRM_RELEASE_STUCK !== '1') {
    console.error('Refusing: set CONFIRM_RELEASE_STUCK=1');
    process.exit(1);
  }

  for (const r of stuck) {
    await releaseStuckParentManualInstallment(r);
    console.log(`Released scheduled_payment ${r.id} → pending`);
  }

  console.log('Done. Parent should refresh Upcoming Payments and try Pay Now again.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
