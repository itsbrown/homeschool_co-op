/**
 * Ops CLI: find succeeded ASA Stripe PaymentIntents missing from `payments`.
 *
 * Dry run (default):
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/sweep-missed-payment-intents.ts --days 90 --dry-run
 *
 * Alert only (error_logs + verify logs, no ledger writes):
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/sweep-missed-payment-intents.ts --days 30 --notify
 *
 * Auto-fix eligible misses (reuses finalizeSucceededPaymentIntent; no new charges):
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/sweep-missed-payment-intents.ts --days 30 --apply
 *
 * Requires STRIPE_SECRET_KEY (with-prod-env). Do not use getStripeClient() — Replit connector can hang.
 */

import {
  formatCents,
  resolveMissedPiSweepConfig,
} from '../lib/missed-payment-intent-sweep';
import { runMissedPaymentIntentSweep } from '../services/missed-payment-intent-sweep';

function parseArgs(argv: string[]): {
  days: number | undefined;
  dryRun: boolean;
  notify: boolean;
  apply: boolean;
} {
  let days: number | undefined;
  let dryRun = true;
  let notify = false;
  let apply = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--days') {
      const raw = Number(argv[i + 1]);
      if (!Number.isFinite(raw) || raw < 1) {
        console.error('--days must be a positive number');
        process.exit(1);
      }
      days = Math.floor(raw);
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
      notify = false;
      apply = false;
    } else if (arg === '--notify') {
      dryRun = false;
      notify = true;
    } else if (arg === '--apply') {
      dryRun = false;
      apply = true;
      notify = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  npx tsx server/scripts/sweep-missed-payment-intents.ts [--days N] [--dry-run|--notify|--apply]

  --dry-run   Print findings only (default). No error_logs, no finalize.
  --notify    Write error_logs + payment_verification_logs. No ledger writes.
  --apply     Same as --notify, plus finalizeSucceeded* for safe misses.
  --days N    Lookback window (default 30, or MISSED_PI_SWEEP_LOOKBACK_DAYS).

  Prod:
    node scripts/with-prod-env.mjs -- npx tsx server/scripts/sweep-missed-payment-intents.ts --days 90 --dry-run`);
      process.exit(0);
    }
  }

  return { days, dryRun, notify, apply };
}

async function main() {
  const { days, dryRun, notify, apply } = parseArgs(process.argv.slice(2));
  const config = resolveMissedPiSweepConfig();
  const lookbackDays = days ?? config.lookbackDays;

  console.log('='.repeat(72));
  console.log('Missed PaymentIntent sweep (Stripe ↔ payments)');
  console.log(
    `Mode: ${apply ? 'APPLY (finalize eligible)' : notify ? 'NOTIFY (alert only)' : 'DRY RUN'} | lookback ${lookbackDays}d`,
  );
  console.log('='.repeat(72));

  const result = await runMissedPaymentIntentSweep({
    lookbackDays,
    dryRun,
    notify,
    autoFix: apply,
    config: { ...config, lookbackDays },
  });

  const report = (label: string, rows: typeof result.missed) => {
    console.log(`\n${label} (${rows.length}):`);
    if (rows.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const row of rows) {
      console.log(
        [
          `  ${row.paymentIntentId}`,
          formatCents(row.amountCents),
          row.parentEmail ?? 'no-email',
          row.enrollmentIds.length > 0 ? `enr=${row.enrollmentIds.join(',')}` : 'no-enrollments',
          row.autoFixEligible ? 'auto-fix-ok' : `skip=${row.skipAutoFixReason}`,
        ].join(' | '),
      );
    }
  };

  report('CRITICAL — succeeded in Stripe, missing from payments', result.missed);
  report('WARNING — in stripe_payment_history only', result.historyOnly);

  console.log(
    `\nScanned ${result.scanned} ASA succeeded PI(s) across ${result.pagesFetched} page(s)` +
      `${result.truncated ? ' (truncated at max pages/PIs)' : ''}.`,
  );
  if (apply) {
    console.log(
      `Auto-fix: ${result.autoFixed.length} applied, ${result.autoFixSkipped.length} skipped, ${result.autoFixFailed.length} failed.`,
    );
  } else if (dryRun) {
    console.log('\nDry run — no error_logs and no ledger writes.');
    console.log('Alert: add --notify. Auto-fix eligible: add --apply (reuses finalizeSucceeded*).');
  }

  if (result.missed.length > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
