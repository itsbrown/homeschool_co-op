/**
 * Deep search app DB + Stripe for a parent in a date window.
 * Usage:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/deep-search-parent-payments-window.ts --email x@y.com --from 2026-04-25 --to 2026-05-25
 */

import postgres from 'postgres';
import Stripe from 'stripe';

function parseArgs() {
  const args = process.argv.slice(2);
  let email = '';
  let from = '2026-04-25';
  let to = '2026-05-25';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') email = args[++i]?.trim().toLowerCase() ?? '';
    else if (args[i] === '--from') from = args[++i] ?? from;
    else if (args[i] === '--to') to = args[++i] ?? to;
  }
  if (!email) {
    console.error('Usage: --email parent@example.com [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
    process.exit(2);
  }
  return { email, from, to };
}

function fmtTs(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

async function main() {
  const { email, from, to } = parseArgs();
  const url = process.env.DATABASE_URL;
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!url || !sk) {
    console.error('DATABASE_URL and STRIPE_SECRET_KEY required');
    process.exit(1);
  }

  const windowStart = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const windowEnd = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);

  const sql = postgres(url, { max: 1 });
  const stripe = new Stripe(sk, { apiVersion: '2025-11-17.clover' as Stripe.LatestApiVersion });

  console.log(`=== DEEP SEARCH: ${email} | ${from} → ${to} ===\n`);

  const appPays = await sql`
    SELECT id, amount/100.0 as dollars, status, stripe_payment_intent_id, stripe_charge_id,
           enrollment_ids, payment_date, created_at, description
    FROM payments
    WHERE lower(parent_email) = lower(${email})
      AND (created_at >= ${from}::date OR payment_date >= ${from}::date)
    ORDER BY coalesce(payment_date, created_at)
  `;
  console.log(`APP payments (${appPays.length}):`);
  for (const p of appPays) console.log(' ', p);

  let sph: Record<string, unknown>[] = [];
  try {
    sph = await sql`
      SELECT id, amount/100.0 as dollars, status, payment_intent_id, charge_id,
             description, stripe_created_at, created_at
      FROM stripe_payment_history
      WHERE lower(parent_email) = lower(${email})
        AND (stripe_created_at >= ${from}::date OR created_at >= ${from}::date)
      ORDER BY coalesce(stripe_created_at, created_at)
    `;
  } catch (e) {
    console.log('stripe_payment_history:', e instanceof Error ? e.message : e);
  }
  console.log(`\nAPP stripe_payment_history (${sph.length}):`);
  for (const r of sph) console.log(' ', r);

  const sched = await sql`
    SELECT id, enrollment_id, amount/100.0 as dollars, status, scheduled_date, processed_at,
           stripe_payment_intent_id, installment_number, total_installments
    FROM scheduled_payments
    WHERE lower(parent_email) = lower(${email})
      AND (scheduled_date >= ${from}::date - interval '5 days'
           OR processed_at >= ${from}::date
           OR created_at >= ${from}::date)
    ORDER BY scheduled_date, id
  `;
  console.log(`\nAPP scheduled_payments (${sched.length}):`);
  for (const s of sched) console.log(' ', s);

  const appPiIds = new Set(
    appPays.map((p) => p.stripe_payment_intent_id).filter(Boolean) as string[],
  );

  const customers = await stripe.customers.list({ email, limit: 10 });
  console.log('\nStripe customers:', customers.data.map((c) => c.id));

  const allPis: Stripe.PaymentIntent[] = [];
  for (const c of customers.data) {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.paymentIntents.list({
        customer: c.id,
        limit: 100,
        created: { gte: windowStart, lte: windowEnd },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      allPis.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  }

  allPis.sort((a, b) => a.created - b.created);
  console.log(`\nSTRIPE PaymentIntents on customer (${allPis.length}):`);
  for (const pi of allPis) {
    console.log(
      JSON.stringify({
        id: pi.id,
        amount: pi.amount / 100,
        status: pi.status,
        created: fmtTs(pi.created),
        inAppPayments: appPiIds.has(pi.id),
        metadata: pi.metadata,
      }),
    );
  }

  const chargeMap = new Map<string, Stripe.Charge>();
  for (const c of customers.data) {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.charges.list({
        customer: c.id,
        limit: 100,
        created: { gte: windowStart, lte: windowEnd },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const ch of page.data) chargeMap.set(ch.id, ch);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  }

  const charges = [...chargeMap.values()].sort((a, b) => a.created - b.created);
  console.log(`\nSTRIPE Charges on customer (${charges.length}):`);
  for (const ch of charges) {
    const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
    console.log(
      JSON.stringify({
        chargeId: ch.id,
        pi: piId,
        amount: ch.amount / 100,
        status: ch.status,
        paid: ch.paid,
        created: fmtTs(ch.created),
        inAppPayments: appPiIds.has(piId ?? '') || appPays.some((p) => p.stripe_charge_id === ch.id),
        failure: ch.failure_message,
      }),
    );
  }

  const sessions: Stripe.Checkout.Session[] = [];
  for (const c of customers.data) {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.checkout.sessions.list({
        customer: c.id,
        limit: 100,
        created: { gte: windowStart, lte: windowEnd },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      sessions.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  }
  sessions.sort((a, b) => a.created - b.created);
  console.log(`\nSTRIPE Checkout sessions (${sessions.length}):`);
  for (const s of sessions) {
    console.log(
      JSON.stringify({
        id: s.id,
        status: s.status,
        amount: (s.amount_total ?? 0) / 100,
        payment_status: s.payment_status,
        pi: s.payment_intent,
        created: fmtTs(s.created),
      }),
    );
  }

  try {
    const search = await stripe.paymentIntents.search({
      query: `metadata['parentEmail']:'${email}' AND created>${windowStart}`,
      limit: 100,
    });
    const inWindow = search.data.filter((p) => p.created <= windowEnd).sort((a, b) => a.created - b.created);
    console.log(`\nSTRIPE PI metadata search (${inWindow.length} in window):`);
    for (const pi of inWindow) {
      console.log(
        JSON.stringify({
          id: pi.id,
          amount: pi.amount / 100,
          status: pi.status,
          created: fmtTs(pi.created),
          inAppPayments: appPiIds.has(pi.id),
          metadata: pi.metadata,
        }),
      );
    }
  } catch (e) {
    console.log('\nPI search API error:', e instanceof Error ? e.message : e);
  }

  const orphans = allPis.filter((p) => p.status === 'succeeded' && !appPiIds.has(p.id));
  console.log(`\n=== ORPHAN SUCCEEDED PIs (Stripe ✓, app payments ✗): ${orphans.length} ===`);
  for (const pi of orphans) {
    console.log(`  ${pi.id}  $${(pi.amount / 100).toFixed(2)}  ${fmtTs(pi.created)}`);
    console.log(`    ${JSON.stringify(pi.metadata)}`);
  }

  const failedAttempts = allPis.filter((p) => p.status !== 'succeeded');
  console.log(`\n=== NON-SUCCEEDED PIs (abandoned/failed): ${failedAttempts.length} ===`);
  for (const pi of failedAttempts) {
    console.log(`  ${pi.id}  $${(pi.amount / 100).toFixed(2)}  ${pi.status}  ${fmtTs(pi.created)}`);
  }

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
