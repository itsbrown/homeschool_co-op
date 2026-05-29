/**
 * AutoPay end-to-end SMOKE orchestrator (Stripe TEST mode only).
 *
 * Drives the real loop:
 *   seed -> charge (off-session PI) -> [Stripe fires webhook] -> assert commit
 *        -> simulate-stuck -> reconcile -> assert backfill -> cleanup
 *
 * This MUTATES the database and creates real (test-mode) Stripe PaymentIntents.
 * It is hard-guarded to refuse live keys and production NODE_ENV. Run only against
 * a dev/staging DB with a Stripe TEST secret key. See docs/APP_KNOWLEDGE/runbooks/autopay-smoke-test.md.
 *
 * Subcommands:
 *   setup       --parent=<email>                 Verify test key + parent Stripe customer/default card.
 *   seed        --parent=<email> [--amount=500] [--enrollment=<id>]
 *                                                Create a due scheduled_payments row (metadata.autoPay=true).
 *   charge      --id=<schedId>                   Create+confirm an off-session PaymentIntent for that row.
 *   assert      --id=<schedId>                   Print PASS/FAIL for completion + ledger + enrollment balance.
 *   simulate-stuck --id=<schedId>                Backdate row to `processing` >stuck-threshold (missed-webhook sim).
 *   reconcile                                    Run stuck-processing reconciliation against Stripe truth.
 *   cleanup     --id=<schedId>                   Cancel the seeded row (test charge left as-is; harmless in test mode).
 *
 * Usage:
 *   npx tsx server/scripts/autopay-smoke.ts setup --parent=test.parent@example.com
 *   npx tsx server/scripts/autopay-smoke.ts seed  --parent=test.parent@example.com --amount=500
 *   npx tsx server/scripts/autopay-smoke.ts charge --id=12345
 *   npx tsx server/scripts/autopay-smoke.ts assert --id=12345
 */

import { getDb } from '../db';
import { storage } from '../storage';
import { scheduledPayments, programEnrollments } from '../../shared/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
import { getStripeClient } from '../config/stripe';
import { runAutoPayOffSessionChargesForResults } from '../services/autopay-off-session-charge';
import { runAutoPayStuckProcessingReconciliation } from '../services/scheduled-payment-reminders';
import { AUTOPAY_PROCESSING_STUCK_MINUTES } from '../services/autopay-observability';

function getArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

/** Refuse to run anything dangerous outside Stripe test mode. */
function assertTestModeSafety(): void {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV=production — this smoke orchestrator is for dev/staging only.');
  }
  if (!key) {
    fail('STRIPE_SECRET_KEY is not set.');
  }
  if (key.startsWith('sk_live')) {
    fail('STRIPE_SECRET_KEY is a LIVE key. Refusing to run — use a Stripe TEST key (sk_test_...).');
  }
  if (!key.startsWith('sk_test')) {
    fail(`STRIPE_SECRET_KEY does not look like a test key (got prefix "${key.slice(0, 8)}"). Refusing.`);
  }
}

async function loadSchedRow(id: number) {
  const db = await getDb();
  const rows: any[] = await (db as any)
    .select()
    .from(scheduledPayments)
    .where(eq(scheduledPayments.id, id));
  return rows[0] ?? null;
}

async function resolveDefaultCard(stripe: any, customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });
  if (customer.deleted) return null;
  const dpm = customer.invoice_settings?.default_payment_method;
  if (typeof dpm === 'string' && dpm.length > 0) return dpm;
  if (dpm && typeof dpm === 'object' && typeof dpm.id === 'string') return dpm.id;
  const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  return list.data[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
async function cmdSetup(): Promise<void> {
  assertTestModeSafety();
  const email = getArg('parent') ?? fail('--parent=<email> is required');
  const parent = await storage.getUserByEmail(email);
  if (!parent) fail(`No user found for ${email}`);

  console.log(`Parent: ${parent.email} (id=${parent.id})`);
  console.log(`stripeCustomerId: ${parent.stripeCustomerId ?? '(none)'}`);
  if (!parent.stripeCustomerId) {
    fail(
      'Parent has no stripeCustomerId. Create a test customer + attach a default test card first (see runbook §2).',
    );
  }

  const stripe = await getStripeClient();
  const card = await resolveDefaultCard(stripe, parent.stripeCustomerId);
  if (!card) {
    fail('Parent has a customer but no default/usable card. Attach test card pm_card_visa as default (runbook §2).');
  }
  console.log(`Default card payment method: ✅ ${card}`);
  console.log('\n✅ setup OK — ready to seed + charge.');
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------
async function cmdSeed(): Promise<void> {
  assertTestModeSafety();
  const email = getArg('parent') ?? fail('--parent=<email> is required');
  const amount = parseInt(getArg('amount') ?? '500', 10);
  if (!Number.isFinite(amount) || amount < 50) fail('--amount must be >= 50 (cents; Stripe minimum).');

  const parent = await storage.getUserByEmail(email);
  if (!parent) fail(`No user found for ${email}`);

  const db = await getDb();
  let enrollmentId = getArg('enrollment') ? parseInt(getArg('enrollment')!, 10) : undefined;

  if (!enrollmentId) {
    const enrollments: any[] = await (db as any)
      .select({ id: programEnrollments.id, schoolId: programEnrollments.schoolId, status: programEnrollments.status })
      .from(programEnrollments)
      .where(and(eq(programEnrollments.parentEmail, email), ne(programEnrollments.status, 'cancelled')))
      .orderBy(desc(programEnrollments.createdAt));
    if (enrollments.length === 0) fail(`No active enrollments for ${email}; pass --enrollment=<id> explicitly.`);
    enrollmentId = enrollments[0].id;
    console.log(`Using enrollment ${enrollmentId} (school ${enrollments[0].schoolId})`);
  }

  const enrollment = await storage.getProgramEnrollmentById(enrollmentId!);
  if (!enrollment) fail(`Enrollment ${enrollmentId} not found.`);

  const dueToday = new Date();
  dueToday.setHours(0, 0, 0, 0);

  const created = await storage.createScheduledPayment({
    schoolId: enrollment.schoolId,
    enrollmentId: enrollment.id,
    parentId: parent.id,
    parentEmail: parent.email,
    amount,
    currency: 'usd',
    scheduledDate: dueToday,
    frequency: 'one_time',
    installmentNumber: 99,
    totalInstallments: 99,
    status: 'pending',
    metadata: { autoPay: true, smokeTest: true },
  } as any);

  console.log(`\n✅ Seeded scheduled payment id=${created.id} amount=$${(amount / 100).toFixed(2)} due ${dueToday.toDateString()}`);
  console.log(`Next: npx tsx server/scripts/autopay-smoke.ts charge --id=${created.id}`);
}

// ---------------------------------------------------------------------------
// charge
// ---------------------------------------------------------------------------
async function cmdCharge(): Promise<void> {
  assertTestModeSafety();
  const id = parseInt(getArg('id') ?? fail('--id=<schedId> is required'), 10);
  const row = await loadSchedRow(id);
  if (!row) fail(`Scheduled payment ${id} not found.`);
  if (!row.metadata?.smokeTest) {
    fail(`Scheduled payment ${id} is not a smoke-test row (metadata.smokeTest != true). Refusing to charge it.`);
  }

  // Force the off-session gate ON for this orchestrated charge (worker-only flag).
  process.env.AUTOPAY_OFF_SESSION_CHARGES = 'true';
  console.log('Set AUTOPAY_OFF_SESSION_CHARGES=true for this process (smoke only).');

  await runAutoPayOffSessionChargesForResults([
    {
      scheduledPaymentId: row.id,
      action: 'process',
      parentId: row.parentId,
      parentEmail: row.parentEmail,
    },
  ]);

  const after = await loadSchedRow(id);
  console.log(`\nRow after charge: status=${after?.status} pi=${after?.stripePaymentIntentId ?? '(none)'}`);
  console.log(
    'If `stripe listen` is forwarding to /api/stripe/webhook, the webhook should mark it `completed` within seconds.\n' +
      `Then: npx tsx server/scripts/autopay-smoke.ts assert --id=${id}`,
  );
}

// ---------------------------------------------------------------------------
// assert
// ---------------------------------------------------------------------------
async function cmdAssert(): Promise<void> {
  const id = parseInt(getArg('id') ?? fail('--id=<schedId> is required'), 10);
  const row = await loadSchedRow(id);
  if (!row) fail(`Scheduled payment ${id} not found.`);

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  checks.push({
    name: 'scheduled_payment status == completed',
    pass: String(row.status) === 'completed',
    detail: `status=${row.status}`,
  });

  let paymentRow: any = null;
  if (row.stripePaymentIntentId) {
    paymentRow = await storage.getPaymentByStripeId(row.stripePaymentIntentId);
  }
  checks.push({
    name: 'payments ledger row exists & completed',
    pass: !!paymentRow && (paymentRow.status === 'completed' || paymentRow.status === 'succeeded'),
    detail: paymentRow ? `payment status=${paymentRow.status}` : 'no payments row for PI',
  });

  const enrollment = await storage.getProgramEnrollmentById(row.enrollmentId);
  checks.push({
    name: 'enrollment has totalPaid > 0',
    pass: !!enrollment && (enrollment.totalPaid ?? 0) > 0,
    detail: enrollment ? `totalPaid=${enrollment.totalPaid} remainingBalance=${enrollment.remainingBalance}` : 'enrollment missing',
  });

  console.log(`\nAssertions for scheduled payment ${id} (PI ${row.stripePaymentIntentId ?? 'none'}):`);
  for (const c of checks) console.log(`  ${c.pass ? '✅' : '❌'} ${c.name} — ${c.detail}`);
  const allPass = checks.every((c) => c.pass);
  console.log(allPass ? '\n✅ SMOKE PASS' : '\n❌ SMOKE FAIL (see above)');
  process.exit(allPass ? 0 : 1);
}

// ---------------------------------------------------------------------------
// simulate-stuck (missed-webhook scenario for reconciliation)
// ---------------------------------------------------------------------------
async function cmdSimulateStuck(): Promise<void> {
  assertTestModeSafety();
  const id = parseInt(getArg('id') ?? fail('--id=<schedId> is required'), 10);
  const row = await loadSchedRow(id);
  if (!row) fail(`Scheduled payment ${id} not found.`);
  if (!row.metadata?.smokeTest) fail(`Refusing: ${id} is not a smoke-test row.`);
  if (!row.stripePaymentIntentId) fail(`Row ${id} has no PaymentIntent — run \`charge\` first.`);

  const backdated = new Date(Date.now() - (AUTOPAY_PROCESSING_STUCK_MINUTES + 1) * 60 * 1000);
  const db = await getDb();
  await (db as any)
    .update(scheduledPayments)
    .set({ status: 'processing', updatedAt: backdated })
    .where(eq(scheduledPayments.id, id));

  console.log(
    `\n✅ Row ${id} set to status=processing, updatedAt=${backdated.toISOString()} ` +
      `(> ${AUTOPAY_PROCESSING_STUCK_MINUTES}min stale).\n` +
      `Next: npx tsx server/scripts/autopay-smoke.ts reconcile`,
  );
}

// ---------------------------------------------------------------------------
// reconcile
// ---------------------------------------------------------------------------
async function cmdReconcile(): Promise<void> {
  assertTestModeSafety();
  console.log('Running stuck-processing reconciliation against Stripe truth...');
  const results = await runAutoPayStuckProcessingReconciliation();
  console.log(`\nReconciliation results (${results.length}):`);
  for (const r of results) console.log(`  scheduled ${r.paymentId}: ${r.action}`);
  console.log('\nThen re-run `assert --id=<id>` to confirm the ledger backfill + balance update.');
}

// ---------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------
async function cmdCleanup(): Promise<void> {
  assertTestModeSafety();
  const id = parseInt(getArg('id') ?? fail('--id=<schedId> is required'), 10);
  const row = await loadSchedRow(id);
  if (!row) fail(`Scheduled payment ${id} not found.`);
  if (!row.metadata?.smokeTest) fail(`Refusing: ${id} is not a smoke-test row.`);

  const db = await getDb();
  await (db as any)
    .update(scheduledPayments)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(scheduledPayments.id, id));

  console.log(`\n✅ Scheduled payment ${id} cancelled.`);
  if (row.stripePaymentIntentId) {
    console.log(
      `Note: test-mode PaymentIntent ${row.stripePaymentIntentId} and any payments/balance rows were left intact ` +
        '(harmless in test mode). Reset your test DB if you want a pristine state.',
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'setup': return cmdSetup();
    case 'seed': return cmdSeed();
    case 'charge': return cmdCharge();
    case 'assert': return cmdAssert();
    case 'simulate-stuck': return cmdSimulateStuck();
    case 'reconcile': return cmdReconcile();
    case 'cleanup': return cmdCleanup();
    default:
      console.log('Usage: npx tsx server/scripts/autopay-smoke.ts <setup|seed|charge|assert|simulate-stuck|reconcile|cleanup> [flags]');
      console.log('See docs/APP_KNOWLEDGE/runbooks/autopay-smoke-test.md');
      process.exit(cmd ? 1 : 0);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Smoke command failed:', err);
    process.exit(1);
  });
