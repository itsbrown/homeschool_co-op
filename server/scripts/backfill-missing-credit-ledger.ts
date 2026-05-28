/**
 * Backfill unified credit ledger for payments that completed without usage logs.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-missing-credit-ledger.ts --dry-run
 *   npx tsx server/scripts/backfill-missing-credit-ledger.ts
 *   npx tsx server/scripts/backfill-missing-credit-ledger.ts --school-id=3 --limit=50
 *
 * Requires DATABASE_URL. Stripe PI repair paths need STRIPE_SECRET_KEY.
 */
import { repairAllMissingCreditLedgerEntries } from '../lib/credit-ledger-repair';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const schoolArg = args.find((a) => a.startsWith('--school-id='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const schoolId = schoolArg ? parseInt(schoolArg.split('=')[1]!, 10) : undefined;
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : 500;

  console.log('='.repeat(72));
  console.log('CREDIT LEDGER BACKFILL');
  console.log('='.repeat(72));
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --apply to write)' : 'LIVE'}`);
  if (schoolId) console.log(`School filter: ${schoolId}`);
  console.log(`Limit: ${limit}`);
  console.log('');

  const summary = await repairAllMissingCreditLedgerEntries({
    schoolId: Number.isFinite(schoolId) ? schoolId : undefined,
    dryRun,
    limit,
  });

  console.log(`Found: ${summary.found}`);
  if (!dryRun) {
    console.log(`Repaired: ${summary.repaired}`);
    console.log(`Failed: ${summary.failed}`);
  }

  for (const row of summary.results) {
    const label =
      row.entry.scheduledPaymentId != null
        ? `SP#${row.entry.scheduledPaymentId}`
        : row.entry.paymentIntentId ?? `pay#${row.entry.paymentId}`;
    console.log(
      `  ${row.entry.parentEmail ?? row.entry.userId} ${label} ` +
        `${row.entry.creditsAppliedCents}c` +
        (dryRun ? ' (would repair)' : row.repaired ? ' OK' : ` FAIL ${row.error ?? ''}`),
    );
  }

  if (dryRun && summary.found > 0) {
    console.log('\nRe-run with --apply to write missing ledger entries.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
