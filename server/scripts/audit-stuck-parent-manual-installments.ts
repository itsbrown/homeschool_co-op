/**
 * Audit parents with stuck parent_manual scheduled payments (Pay Now / INSTALLMENT_NOT_AVAILABLE).
 *
 * Dry run (prod):
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/audit-stuck-parent-manual-installments.ts
 *
 * Release all matches (prod):
 *   CONFIRM_RELEASE_STUCK=1 node scripts/with-prod-env.mjs npx tsx server/scripts/audit-stuck-parent-manual-installments.ts --apply
 *
 * Include processing rows even if under 15m (immediate diagnostic):
 *   ... --include-recent-processing
 */

import {
  findStuckParentManualInstallments,
  releaseAllStuckParentManualInstallments,
  PARENT_MANUAL_STUCK_MINUTES,
} from '../lib/stuck-parent-manual-installments';

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const includeRecentProcessing = process.argv.includes('--include-recent-processing');
  return { apply, includeRecentProcessing };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const { apply, includeRecentProcessing } = parseArgs();
  const findOpts = {
    processingOlderThanMinutes: includeRecentProcessing ? 0 : PARENT_MANUAL_STUCK_MINUTES,
    includeFailedWithPi: true,
    onlyOwingEnrollments: true,
  };

  const rows = await findStuckParentManualInstallments(findOpts);

  console.log('='.repeat(72));
  console.log('Stuck parent_manual installments audit');
  console.log(
    `Mode: ${apply ? 'APPLY (release)' : 'AUDIT ONLY'} | processing threshold: ${findOpts.processingOlderThanMinutes}m`,
  );
  console.log('='.repeat(72));

  if (rows.length === 0) {
    console.log('\nNo stuck parent_manual installments found.');
    return;
  }

  console.log(`\nFound ${rows.length} row(s):\n`);
  for (const row of rows) {
    console.log(
      [
        `SP #${row.id}`,
        row.parentEmail,
        row.parentName ? `(${row.parentName})` : '',
        `| ${row.childName ?? '?'} — ${row.className ?? '?'}`,
        `| ${formatCents(row.amount)} owed on enrollment (${formatCents(row.enrollmentBalanceCents)} balance)`,
        `| status=${row.status}`,
        `| stuck ${row.minutesStuck}m`,
        row.stripePaymentIntentId ? `| pi=${row.stripePaymentIntentId}` : '',
        row.failureReason ? `| ${row.failureReason}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  const byParent = new Map<string, number>();
  for (const row of rows) {
    byParent.set(row.parentEmail, (byParent.get(row.parentEmail) ?? 0) + 1);
  }
  console.log(`\nAffected parents: ${byParent.size}`);

  if (!apply) {
    console.log(
      `\nDry run — to release: CONFIRM_RELEASE_STUCK=1 ... audit-stuck-parent-manual-installments.ts --apply`,
    );
    return;
  }

  if (process.env.CONFIRM_RELEASE_STUCK !== '1') {
    console.error('\nRefusing --apply without CONFIRM_RELEASE_STUCK=1');
    process.exit(1);
  }

  const result = await releaseAllStuckParentManualInstallments(findOpts);
  console.log(`\nReleased: ${result.released} | errors: ${result.errors}`);
  for (const r of result.rows) {
    console.log(`  #${r.id} ${r.parentEmail} → ${r.action}${r.detail ? ` (${r.detail})` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
