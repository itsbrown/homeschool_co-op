/**
 * AutoPay + Communications Preflight / Smoke Check (READ-ONLY)
 *
 * Verifies — without charging anyone or mutating any row — whether autopay is
 * configured to run safely and whether the email/notification pipeline is healthy.
 * Mirrors the real runtime preconditions in:
 *   - server/services/autopay-policy.ts            (due selection + policy guards)
 *   - server/services/autopay-off-session-charge.ts (off-session charge gating)
 *   - server/services/scheduled-payment-reminders.ts (reconciliation of stuck rows)
 *   - server/lib/email-service.ts                  (Brevo email_log outcomes)
 *
 * It does NOT create PaymentIntents, send emails, or write to the DB. The only
 * outbound calls are read-only Stripe retrieves (account, customer, payment intent),
 * and only when you pass --charge-preview / --reconcile-preview.
 *
 * Usage:
 *   npx tsx server/scripts/autopay-preflight.ts
 *   npx tsx server/scripts/autopay-preflight.ts --charge-preview --limit=25
 *   npx tsx server/scripts/autopay-preflight.ts --reconcile-preview --email-hours=72
 *
 * Flags:
 *   --charge-preview      For each due candidate, do read-only Stripe lookups to
 *                         report would-charge vs would-skip (and the reason).
 *   --reconcile-preview   Retrieve Stripe status for stuck `processing` rows to show
 *                         what reconciliation WOULD do. (Read-only.)
 *   --limit=N             Cap the number of rows inspected with Stripe (default 25).
 *   --email-hours=N       Lookback window for email_log health (default 72).
 */

import { getDb } from '../db';
import { scheduledPayments, users, emailLog } from '../../shared/schema';
import { and, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import {
  AUTOPAY_MAX_RETRY_ATTEMPTS,
  AUTOPAY_STALE_ATTEMPT_DAYS,
  buildDueAutoPayQueryCriteria,
} from '../services/autopay-policy';
import { AUTOPAY_PROCESSING_STUCK_MINUTES } from '../services/autopay-observability';
import { isAutopayOffSessionChargesEnabled } from '../services/autopay-off-session-charge';
import { getStripeClient } from '../config/stripe';

type Flags = {
  chargePreview: boolean;
  reconcilePreview: boolean;
  limit: number;
  emailHours: number;
};

function parseFlags(argv: string[]): Flags {
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const hoursArg = argv.find((a) => a.startsWith('--email-hours='));
  return {
    chargePreview: argv.includes('--charge-preview'),
    reconcilePreview: argv.includes('--reconcile-preview'),
    limit: limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 25) : 25,
    emailHours: hoursArg ? Math.max(1, parseInt(hoursArg.split('=')[1], 10) || 72) : 72,
  };
}

function isTruthyEnv(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function present(name: string): string {
  return process.env[name] && process.env[name] !== '' ? '✅ set' : '❌ missing';
}

function hr(title: string): void {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

/** Mirrors resolveDefaultCardPaymentMethodId in autopay-off-session-charge.ts. */
async function resolveDefaultCard(
  stripe: Awaited<ReturnType<typeof getStripeClient>>,
  customerId: string,
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });
  if ((customer as any).deleted) return null;
  const dpm = (customer as any).invoice_settings?.default_payment_method;
  if (typeof dpm === 'string' && dpm.length > 0) return dpm;
  if (dpm && typeof dpm === 'object' && typeof dpm.id === 'string') return dpm.id;
  const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  return list.data[0]?.id ?? null;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const now = new Date();

  console.log('AutoPay + Communications Preflight (read-only)');
  console.log(`Generated: ${now.toISOString()}`);

  // ---------------------------------------------------------------------------
  // 1) Environment & gating
  // ---------------------------------------------------------------------------
  hr('1) ENVIRONMENT & GATING');
  const nodeEnv = process.env.NODE_ENV ?? '(unset)';
  const bgJobs = isTruthyEnv(process.env.ENABLE_BACKGROUND_JOBS);
  const offSession = isAutopayOffSessionChargesEnabled();
  const requireMeta = isTruthyEnv(process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY);

  console.log(`NODE_ENV                          : ${nodeEnv}`);
  console.log(`DATABASE_URL                      : ${present('DATABASE_URL')}`);
  console.log(`STRIPE_SECRET_KEY                 : ${present('STRIPE_SECRET_KEY')}`);
  console.log(`STRIPE_WEBHOOK_SECRET             : ${present('STRIPE_WEBHOOK_SECRET')}`);
  console.log(`BREVO_API_KEY                     : ${present('BREVO_API_KEY')}`);
  console.log(`ENABLE_BACKGROUND_JOBS            : ${bgJobs ? '✅ true (this is a worker)' : 'off'}`);
  console.log(`AUTOPAY_OFF_SESSION_CHARGES       : ${offSession ? '⚠️  true (will charge cards)' : 'off (no auto-charges)'}`);
  console.log(`AUTOPAY_REQUIRE_METADATA_AUTO_PAY : ${requireMeta ? 'true (only metadata.autoPay rows)' : 'off (all due rows eligible)'}`);
  console.log(`Retry cap / stale cutoff          : ${AUTOPAY_MAX_RETRY_ATTEMPTS} attempts / ${AUTOPAY_STALE_ATTEMPT_DAYS} days`);

  const warnings: string[] = [];
  if (offSession && !bgJobs) {
    warnings.push(
      'AUTOPAY_OFF_SESSION_CHARGES=true but ENABLE_BACKGROUND_JOBS is off on this process — charges only run on the singleton worker.',
    );
  }
  if (offSession && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push(
      'Off-session charging is on but STRIPE_WEBHOOK_SECRET is missing — charges would succeed at Stripe but never commit to the DB (silent-failure class).',
    );
  }
  if (!process.env.BREVO_API_KEY) {
    warnings.push('BREVO_API_KEY missing — all autopay emails (reminders, pre-charge, receipts) are silently skipped.');
  }

  const db = await getDb();

  // ---------------------------------------------------------------------------
  // 2) Stripe connectivity & mode
  // ---------------------------------------------------------------------------
  hr('2) STRIPE CONNECTIVITY & MODE');
  const keyPrefix = (process.env.STRIPE_SECRET_KEY ?? '').slice(0, 8);
  const mode = keyPrefix.startsWith('sk_live') ? 'LIVE' : keyPrefix.startsWith('sk_test') ? 'TEST' : 'UNKNOWN';
  console.log(`Key mode (by prefix)              : ${mode}`);
  let stripe: Awaited<ReturnType<typeof getStripeClient>> | null = null;
  try {
    stripe = await getStripeClient();
    const acct = await stripe.accounts.retrieve();
    console.log(`Stripe account                    : ✅ reachable (${acct.id})`);
  } catch (err) {
    console.log(`Stripe account                    : ❌ unreachable — ${(err as Error).message}`);
    warnings.push('Stripe API key could not authenticate — autopay charges and reconciliation cannot run.');
  }

  // ---------------------------------------------------------------------------
  // 3) Scheduled-payment population overview
  // ---------------------------------------------------------------------------
  hr('3) SCHEDULED PAYMENT POPULATION');
  const statusRows: Array<{ status: string }> = await (db as any)
    .select({ status: scheduledPayments.status })
    .from(scheduledPayments);
  const byStatus = statusRows.reduce((acc: Record<string, number>, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('Counts by status:', byStatus);

  // ---------------------------------------------------------------------------
  // 4) Due candidates (exactly what the worker would pick up)
  // ---------------------------------------------------------------------------
  hr('4) DUE AUTOPAY CANDIDATES (policy-eligible)');
  const criteria = buildDueAutoPayQueryCriteria(now);
  console.log(
    `Window: due ${criteria.dueOnOrAfter.toISOString().slice(0, 10)} .. ${criteria.dueOnOrBefore
      .toISOString()
      .slice(0, 10)}, status in [${criteria.statuses.join(', ')}], retryCount < ${criteria.retryCountLessThan}`,
  );

  type DueRow = {
    id: number;
    amount: number;
    scheduledDate: Date;
    status: string;
    retryCount: number;
    parentId: number;
    parentEmail: string;
    metadata: unknown;
    installmentNumber: number;
    totalInstallments: number;
  };
  const dueRows: DueRow[] = await (db as any)
    .select({
      id: scheduledPayments.id,
      amount: scheduledPayments.amount,
      scheduledDate: scheduledPayments.scheduledDate,
      status: scheduledPayments.status,
      retryCount: scheduledPayments.retryCount,
      parentId: scheduledPayments.parentId,
      parentEmail: scheduledPayments.parentEmail,
      metadata: scheduledPayments.metadata,
      installmentNumber: scheduledPayments.installmentNumber,
      totalInstallments: scheduledPayments.totalInstallments,
    })
    .from(scheduledPayments)
    .where(
      and(
        (inArray as any)(scheduledPayments.status, criteria.statuses),
        lte(scheduledPayments.scheduledDate, criteria.dueOnOrBefore),
        gte(scheduledPayments.scheduledDate, criteria.dueOnOrAfter),
        lt(scheduledPayments.retryCount, criteria.retryCountLessThan),
      ),
    );

  console.log(`Due candidates: ${dueRows.length}`);
  const dueTotalCents = dueRows.reduce((s: number, r) => s + (r.amount ?? 0), 0);
  console.log(`Due amount total: $${(dueTotalCents / 100).toFixed(2)}`);

  if (flags.chargePreview) {
    if (!stripe) {
      console.log('  (skipping charge preview — Stripe unreachable)');
    } else {
      console.log(`\nCharge preview (read-only, first ${flags.limit}):`);
      const outcomes = { would_charge: 0, no_customer: 0, no_card: 0, metadata_opt_out: 0, invalid_amount: 0 };
      for (const row of dueRows.slice(0, flags.limit)) {
        const amountCents = Math.round(Number(row.amount));
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          outcomes.invalid_amount++;
          continue;
        }
        if (requireMeta && (row.metadata as any)?.autoPay !== true) {
          outcomes.metadata_opt_out++;
          continue;
        }
        const parent: Array<{ stripeCustomerId: string | null }> = await (db as any)
          .select({ stripeCustomerId: users.stripeCustomerId })
          .from(users)
          .where(eq(users.id, row.parentId));
        const customerId = parent[0]?.stripeCustomerId ?? null;
        if (!customerId) {
          outcomes.no_customer++;
          console.log(`  sched ${row.id}: SKIP (parent ${row.parentId} has no stripeCustomerId)`);
          continue;
        }
        try {
          const card = await resolveDefaultCard(stripe, customerId);
          if (!card) {
            outcomes.no_card++;
            console.log(`  sched ${row.id}: SKIP (no default/card payment method)`);
          } else {
            outcomes.would_charge++;
            console.log(`  sched ${row.id}: WOULD CHARGE $${(amountCents / 100).toFixed(2)} (card ${card})`);
          }
        } catch (err) {
          outcomes.no_card++;
          console.log(`  sched ${row.id}: SKIP (card lookup failed: ${(err as Error).message})`);
        }
      }
      console.log('Charge-preview outcomes:', outcomes);
      if (!offSession) {
        console.log('  NOTE: AUTOPAY_OFF_SESSION_CHARGES is off, so none of these would actually be charged.');
      }
    }
  } else {
    console.log('  (pass --charge-preview to see per-candidate would-charge/skip via read-only Stripe lookups)');
  }

  // ---------------------------------------------------------------------------
  // 5) Stuck `processing` rows (reconciliation targets)
  // ---------------------------------------------------------------------------
  hr('5) STUCK `processing` ROWS (reconciliation targets)');
  const stuckCutoff = new Date(now.getTime() - AUTOPAY_PROCESSING_STUCK_MINUTES * 60 * 1000);
  type StuckRow = { id: number; stripePaymentIntentId: string | null; updatedAt: Date | null; retryCount: number };
  const stuckRows: StuckRow[] = await (db as any)
    .select({
      id: scheduledPayments.id,
      stripePaymentIntentId: scheduledPayments.stripePaymentIntentId,
      updatedAt: scheduledPayments.updatedAt,
      retryCount: scheduledPayments.retryCount,
    })
    .from(scheduledPayments)
    .where(and(eq(scheduledPayments.status, 'processing'), lt(scheduledPayments.updatedAt, stuckCutoff)));

  console.log(`Stuck > ${AUTOPAY_PROCESSING_STUCK_MINUTES} min: ${stuckRows.length}`);
  if (stuckRows.length > 0 && flags.reconcilePreview && stripe) {
    console.log(`\nReconcile preview (read-only Stripe status, first ${flags.limit}):`);
    for (const row of stuckRows.slice(0, flags.limit)) {
      if (!row.stripePaymentIntentId) {
        console.log(`  sched ${row.id}: no PI id (would stay processing / move pending)`);
        continue;
      }
      try {
        const pi = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId);
        console.log(`  sched ${row.id}: PI ${pi.id} -> stripe status=${pi.status}`);
      } catch (err) {
        console.log(`  sched ${row.id}: PI ${row.stripePaymentIntentId} retrieve failed: ${(err as Error).message}`);
      }
    }
  } else if (stuckRows.length > 0) {
    console.log('  (pass --reconcile-preview to retrieve Stripe status for each stuck row)');
  }

  // ---------------------------------------------------------------------------
  // 6) Communications health (email_log)
  // ---------------------------------------------------------------------------
  hr('6) COMMUNICATIONS HEALTH (email_log)');
  const since = new Date(now.getTime() - flags.emailHours * 60 * 60 * 1000);
  type EmailRow = { type: string; status: string; error: string | null; recipientEmail: string; createdAt: Date };
  const recent: EmailRow[] = await (db as any)
    .select({
      type: emailLog.type,
      status: emailLog.status,
      error: emailLog.error,
      recipientEmail: emailLog.recipientEmail,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .where(gte(emailLog.createdAt, since))
    .orderBy(desc(emailLog.createdAt));

  console.log(`Window: last ${flags.emailHours}h (${recent.length} send attempts)`);
  const byStatusEmail = recent.reduce((acc: Record<string, number>, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('By status:', byStatusEmail);

  const failures = recent.filter((r) => r.status !== 'sent');
  const ipBlocked = failures.filter((r) => (r.error ?? '').toLowerCase().includes('whitelist')).length;
  const notConfigured = failures.filter((r) => (r.error ?? '').toLowerCase().includes('not configured')).length;
  const timeouts = recent.filter((r) => r.status === 'timeout').length;
  if (ipBlocked > 0) warnings.push(`${ipBlocked} emails failed with "IP not whitelisted" — fix Brevo IP allowlist for your prod egress IP.`);
  if (notConfigured > 0) warnings.push(`${notConfigured} emails skipped as "Brevo not configured" — BREVO_API_KEY not loaded where emails are sent.`);
  if (timeouts > 0) warnings.push(`${timeouts} emails timed out (>10s) — Brevo latency or network egress issue.`);

  const failuresByType = failures.reduce((acc: Record<string, number>, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  if (failures.length > 0) console.log('Failures by type:', failuresByType);

  // ---------------------------------------------------------------------------
  // Verdict
  // ---------------------------------------------------------------------------
  hr('VERDICT');
  if (warnings.length === 0) {
    console.log('✅ No blocking issues detected by preflight.');
  } else {
    console.log(`⚠️  ${warnings.length} item(s) need attention:`);
    warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
  }
  console.log(
    '\nReminder: this is a config + data preflight. A full smoke test still requires a Stripe test-mode\n' +
      'charge with the Stripe CLI forwarding webhooks to /api/stripe/webhook (see docs/AUTOPAY_PRODUCTION_CHECKLIST.md §6).',
  );

  process.exit(warnings.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Preflight failed:', err);
  process.exit(1);
});
