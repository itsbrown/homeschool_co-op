/**
 * Off-session Stripe charges for due scheduled installments (singleton worker).
 * Opt-in via AUTOPAY_OFF_SESSION_CHARGES=true so web/API replicas never surprise-charge by accident.
 */

import Stripe from "stripe";
import { storage } from "../storage";
import { getDb } from "../db";
import { scheduledPayments } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { getStripeClient } from "../config/stripe";
import {
  buildScheduledPaymentIntentMetadata,
  resolveEnrollmentIdsFromScheduledRow,
} from "../lib/scheduled-payment-intent-metadata";
import { decideAutoPayAttemptStart } from "./autopay-lifecycle";
import {
  AUTOPAY_METRIC_OFF_SESSION_CHARGES_TOTAL,
  buildAutoPayOffSessionChargeLabels,
} from "./autopay-observability";

function isTruthyEnv(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isAutopayOffSessionChargesEnabled(): boolean {
  return isTruthyEnv(process.env.AUTOPAY_OFF_SESSION_CHARGES);
}

function isMetadataAutopayOptInRequired(): boolean {
  return isTruthyEnv(process.env.AUTOPAY_REQUIRE_METADATA_AUTO_PAY);
}

function scheduledRowAllowsOffSessionAutopay(row: { metadata: unknown }): boolean {
  if (!isMetadataAutopayOptInRequired()) return true;
  const m = row.metadata as Record<string, unknown> | null | undefined;
  return m?.autoPay === true;
}

function logOffSessionChargeTelemetry(outcome: "created" | "skipped" | "failed", reason?: string): void {
  console.log(
    JSON.stringify({
      autopay_metric: AUTOPAY_METRIC_OFF_SESSION_CHARGES_TOTAL,
      labels: buildAutoPayOffSessionChargeLabels(outcome, reason),
    }),
  );
}

async function resolveDefaultCardPaymentMethodId(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return null;
  const dpm = customer.invoice_settings?.default_payment_method;
  if (typeof dpm === "string" && dpm.length > 0) return dpm;
  if (dpm && typeof dpm === "object" && "id" in dpm && typeof (dpm as { id: string }).id === "string") {
    return (dpm as { id: string }).id;
  }
  const list = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return list.data[0]?.id ?? null;
}

async function loadScheduledPaymentRowById(id: number) {
  const db = await getDb();
  const [row] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, id));
  return row ?? null;
}

/**
 * For each `action: 'process'` candidate, create/confirm an off-session PaymentIntent when enabled
 * and the parent has a usable saved card. Metadata matches `webhook-handler` scheduled_payment branch.
 */
export async function runAutoPayOffSessionChargesForResults(
  results: Array<{
    scheduledPaymentId: number;
    action: "process" | "skip";
    parentId?: number;
    parentEmail?: string;
  }>,
): Promise<void> {
  if (!isAutopayOffSessionChargesEnabled()) {
    return;
  }

  const toCharge = results.filter((r) => r.action === "process");
  if (toCharge.length === 0) return;

  const stripe = await getStripeClient();

  for (const item of toCharge) {
    const parentId = item.parentId;
    const parentEmail = item.parentEmail;
    if (parentId == null || !parentEmail) {
      console.warn(`[autopay-charge] skip scheduled ${item.scheduledPaymentId}: missing parent identity`);
      logOffSessionChargeTelemetry("skipped", "missing_parent");
      continue;
    }

    try {
      const row = await loadScheduledPaymentRowById(item.scheduledPaymentId);
      if (!row) {
        console.warn(`[autopay-charge] skip: scheduled payment ${item.scheduledPaymentId} not found`);
        logOffSessionChargeTelemetry("skipped", "not_found");
        continue;
      }

      if (!scheduledRowAllowsOffSessionAutopay(row)) {
        console.warn(`[autopay-charge] skip scheduled ${row.id}: metadata autoPay opt-in required`);
        logOffSessionChargeTelemetry("skipped", "metadata_opt_in");
        continue;
      }

      const decision = decideAutoPayAttemptStart({
        id: row.id,
        amount: row.amount,
        retryCount: row.retryCount,
        status: row.status,
        stripePaymentIntentId: row.stripePaymentIntentId,
      });

      if (decision.action === "skip_terminal") {
        continue;
      }
      if (decision.action === "replay_existing_attempt") {
        console.log(
          `[autopay-charge] skip new PI for scheduled ${row.id}; existing processing PI ${decision.paymentIntentId}`,
        );
        logOffSessionChargeTelemetry("skipped", "lifecycle_replay");
        continue;
      }

      const amountCents = Math.round(Number(row.amount));
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        console.warn(`[autopay-charge] skip scheduled ${row.id}: invalid amount`);
        logOffSessionChargeTelemetry("skipped", "invalid_amount");
        continue;
      }

      const parentUser = await storage.getUser(parentId);
      const customerId = parentUser?.stripeCustomerId ?? null;
      if (!customerId) {
        console.warn(`[autopay-charge] skip scheduled ${row.id}: parent ${parentId} has no stripeCustomerId`);
        logOffSessionChargeTelemetry("skipped", "no_customer");
        continue;
      }

      const paymentMethodId = await resolveDefaultCardPaymentMethodId(stripe, customerId);
      if (!paymentMethodId) {
        console.warn(
          `[autopay-charge] skip scheduled ${row.id}: no default/card payment method for customer ${customerId}`,
        );
        logOffSessionChargeTelemetry("skipped", "no_payment_method");
        continue;
      }

      const enrollmentIds = resolveEnrollmentIdsFromScheduledRow(row);
      const metadata = buildScheduledPaymentIntentMetadata({
        scheduledPaymentId: row.id,
        parentEmail: row.parentEmail,
        parentUserId: parentId,
        installmentNumber: row.installmentNumber,
        totalInstallments: row.totalInstallments,
        enrollmentIds,
        autoPayInitiated: true,
        chargeAmountCents: amountCents,
        description: `Installment ${row.installmentNumber}/${row.totalInstallments} (auto-pay)`,
      });

      const retryCount = Number.isFinite(row.retryCount) ? Math.max(0, Math.floor(Number(row.retryCount))) : 0;
      const idempotencyKey = `autopay_sched_${row.id}_r${retryCount}`;

      let pi: Stripe.PaymentIntent;
      try {
        pi = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: (row.currency || "usd").toLowerCase(),
            customer: customerId,
            payment_method: paymentMethodId,
            payment_method_types: ["card"],
            off_session: true,
            confirm: true,
            metadata,
            description: metadata.description,
          },
          { idempotencyKey },
        );
      } catch (err: unknown) {
        const { handleScheduledPaymentFailed } = await import("./auto-pay-webhook-helpers.js");
        const stripeErr = err as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
        const failedPi = stripeErr.payment_intent;
        if (failedPi?.id) {
          try {
            await storage.updateScheduledPayment(row.id, {
              stripePaymentIntentId: failedPi.id,
              status: "processing",
              chargedBy: "auto_pay",
            });
          } catch (persistErr) {
            console.error(`[autopay-charge] could not persist failed PI id for scheduled ${row.id}:`, persistErr);
          }
        }
        const msg =
          stripeErr instanceof Error ? stripeErr.message : typeof stripeErr?.message === "string"
            ? stripeErr.message
            : "Stripe error";
        await handleScheduledPaymentFailed(row.id, {
          parentEmail: row.parentEmail,
          lastPaymentErrorMessage: msg,
        });
        console.error(`[autopay-charge] scheduled ${row.id} charge failed:`, msg);
        logOffSessionChargeTelemetry("failed", "stripe_error");
        continue;
      }

      await storage.updateScheduledPayment(row.id, {
        stripePaymentIntentId: pi.id,
        status: "processing",
        chargedBy: "auto_pay",
      });

      console.log(`[autopay-charge] scheduled ${row.id} PI ${pi.id} status=${pi.status}`);
      logOffSessionChargeTelemetry("created", "pi_submitted");
    } catch (outer) {
      console.error(`[autopay-charge] unexpected error for scheduled ${item.scheduledPaymentId}:`, outer);
      logOffSessionChargeTelemetry("failed", "unexpected");
    }
  }
}
