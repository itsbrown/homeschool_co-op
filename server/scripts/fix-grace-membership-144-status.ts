/**
 * Grace Mulcahy (parent 66) — membership #144 shows pending_payment with $0 balance_due
 * after payment #142 ($175) was applied. Align status + amount_paid with ledger.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-grace-membership-144-status.ts --dry-run
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/fix-grace-membership-144-status.ts
 */
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

const MEMBERSHIP_ID = 144;
const EXPECTED_PAID_CENTS = 17500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = await getDb();

  const rows = (await db.execute(sql`
    SELECT id, parent_user_id, status, amount, amount_paid, remaining_balance, balance_due, membership_year
    FROM membership_enrollments WHERE id = ${MEMBERSHIP_ID}
  `)) as Array<{
    id: number;
    parent_user_id: number;
    status: string;
    amount: number;
    amount_paid: number;
    remaining_balance: number;
    balance_due: number;
    membership_year: number;
  }>;

  if (rows.length === 0) {
    console.error(`Membership ${MEMBERSHIP_ID} not found`);
    process.exit(1);
  }

  const m = rows[0];
  console.log('Before:', m);

  if (m.balance_due === 0 && m.amount_paid >= EXPECTED_PAID_CENTS && m.status === 'enrolled') {
    console.log('Already correct — no update needed.');
    return;
  }

  if (m.balance_due !== 0) {
    console.error(`Refusing update: balance_due is ${m.balance_due} (expected 0). Investigate first.`);
    process.exit(1);
  }

  const patch = {
    status: 'enrolled',
    amount_paid: EXPECTED_PAID_CENTS,
    remaining_balance: 0,
    balance_due: 0,
  };

  console.log('Patch:', patch);

  if (dryRun) {
    console.log('Dry run — no DB write.');
    return;
  }

  await db.execute(sql`
    UPDATE membership_enrollments
    SET status = 'enrolled',
        amount_paid = ${EXPECTED_PAID_CENTS},
        remaining_balance = 0,
        balance_due = 0,
        updated_at = NOW()
    WHERE id = ${MEMBERSHIP_ID}
  `);

  const after = (await db.execute(sql`
    SELECT id, status, amount_paid, remaining_balance, balance_due
    FROM membership_enrollments WHERE id = ${MEMBERSHIP_ID}
  `)) as unknown[];
  console.log('After:', after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
