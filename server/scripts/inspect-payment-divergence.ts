/**
 * READ-ONLY diagnostic for the Brittany Spencer / Grace Mulcahy payment-divergence
 * incidents. Runs only SELECTs. Does NOT mutate anything.
 *
 * Usage: tsx server/scripts/inspect-payment-divergence.ts
 */
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

const BRITTANY_PI = 'pi_3TcPxHGHVuNOnUs70sDc6Zwo';
const GRACE_PARENT_ID = 66;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('No DB connection (DATABASE_URL missing or unreachable)');

  const show = async (label: string, query: any) => {
    const rows = await db.execute(query);
    const arr = Array.isArray(rows) ? rows : (rows as any).rows ?? rows;
    console.log(`\n===== ${label} (${arr.length ?? 'n/a'} rows) =====`);
    console.dir(arr, { depth: 6, maxArrayLength: 100 });
  };

  // ---------- BRITTANY ----------
  await show('Brittany — user candidates', sql`
    SELECT id, email, name, first_name, last_name, school_id, role, stripe_customer_id
    FROM users
    WHERE email ILIKE '%varsitybasketballbr04%'
       OR name ILIKE '%brittany%spencer%'
       OR (first_name ILIKE 'brittany%' AND last_name ILIKE 'spencer%')
  `);

  await show('Brittany — payments row for the PI', sql`
    SELECT id, school_id, parent_id, parent_email, amount, status,
           stripe_payment_intent_id, child_name, class_name, description, payment_date, created_at
    FROM payments
    WHERE stripe_payment_intent_id = ${BRITTANY_PI}
  `);

  await show('Brittany — stripe_payment_history for the PI', sql`
    SELECT id, user_id, payment_intent_id, amount, status, description, stripe_created_at, created_at
    FROM stripe_payment_history
    WHERE payment_intent_id = ${BRITTANY_PI}
  `);

  await show('Brittany — enrollments (by user email)', sql`
    SELECT e.id, e.child_name, e.class_name, e.status, e.payment_status, e.payment_plan,
           e.total_cost, e.total_paid, e.remaining_balance, e.effective_balance,
           e.program_start_date, e.enrollment_date
    FROM program_enrollments e
    JOIN users u ON u.id = e.parent_id
    WHERE u.email ILIKE '%varsitybasketballbr04%'
       OR u.name ILIKE '%brittany%spencer%'
    ORDER BY e.id
  `);

  // ---------- GRACE ----------
  await show('Grace — user', sql`
    SELECT id, email, name, first_name, last_name, school_id, role, stripe_customer_id
    FROM users WHERE id = ${GRACE_PARENT_ID}
  `);

  await show('Grace — enrollments', sql`
    SELECT id, child_name, class_name, status, payment_status, payment_plan,
           total_cost, total_paid, remaining_balance, effective_balance,
           comp_amount_cents, program_start_date, enrollment_date
    FROM program_enrollments
    WHERE parent_id = ${GRACE_PARENT_ID}
    ORDER BY id
  `);

  await show('Grace — payments (all)', sql`
    SELECT id, amount, status, stripe_payment_intent_id, child_name, class_name,
           description, payment_date, created_at
    FROM payments
    WHERE parent_id = ${GRACE_PARENT_ID}
    ORDER BY created_at
  `);

  await show('Grace — stripe_payment_history (all)', sql`
    SELECT id, payment_intent_id, amount, status, description, stripe_created_at
    FROM stripe_payment_history
    WHERE user_id = ${GRACE_PARENT_ID}
    ORDER BY stripe_created_at
  `);

  await show('Grace — scheduled_payments (all)', sql`
    SELECT id, enrollment_id, amount, status, installment_number, total_installments,
           scheduled_date, processed_at, stripe_payment_intent_id
    FROM scheduled_payments
    WHERE parent_id = ${GRACE_PARENT_ID}
    ORDER BY enrollment_id, scheduled_date
  `);

  console.log('\n✅ Read-only inspection complete. No data was modified.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Inspection failed:', err);
  process.exit(1);
});
