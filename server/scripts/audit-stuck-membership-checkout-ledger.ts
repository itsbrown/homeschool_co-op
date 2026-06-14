/**
 * Audit membership rows stamped with a checkout PI but still showing unpaid ledger.
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/audit-stuck-membership-checkout-ledger.ts
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db';

async function main() {
  const db = await getDb();
  const rows = (await db.execute(sql`
    SELECT me.id,
           me.parent_user_id,
           u.email AS parent_email,
           me.amount,
           me.amount_paid,
           me.remaining_balance,
           me.status,
           me.notes,
           me.created_at,
           me.updated_at
    FROM membership_enrollments me
    JOIN users u ON u.id = me.parent_user_id
    WHERE me.notes ILIKE '%Stripe payment via cart checkout (pi_%'
      AND me.amount_paid = 0
      AND me.remaining_balance > 0
    ORDER BY me.updated_at DESC
  `)) as Array<{
    id: number;
    parent_user_id: number;
    parent_email: string;
    amount: number;
    amount_paid: number;
    remaining_balance: number;
    status: string;
    notes: string | null;
  }>;

  const list = Array.isArray(rows) ? rows : (rows as { rows?: typeof rows }).rows ?? [];

  console.log('='.repeat(72));
  console.log('Stuck membership checkout ledger (PI in notes, amount_paid = 0)');
  console.log('='.repeat(72));

  if (list.length === 0) {
    console.log('\nNo stuck rows found.');
    return;
  }

  console.log(`\nFound ${list.length} row(s):\n`);
  for (const row of list) {
    console.log(
      [
        `#${row.id}`,
        row.parent_email,
        `status=${row.status}`,
        `owed=$${((row.remaining_balance ?? 0) / 100).toFixed(2)}`,
        row.notes?.slice(0, 80) ?? '',
      ].join(' | '),
    );
  }

  console.log(
    '\nAfter deploy: webhook replay or POST /api/billing/fulfill-payment-intent will re-apply membership.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
