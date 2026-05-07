# Autopay Production Checklist

Use this checklist before and after enabling autopay in production.

## 1) Stripe configuration

- Ensure `STRIPE_SECRET_KEY` is set in production runtime.
- Ensure `STRIPE_WEBHOOK_SECRET` is set and matches the webhook endpoint in Stripe.
- Confirm webhook endpoint points to `/api/stripe/webhook`.
- Verify webhook subscriptions include at minimum:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `checkout.session.completed`
  - `charge.refunded`
  - membership events if used (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`).

## 2) Idempotency and duplicate safety

- Confirm webhook signature verification is enabled (no dev bypass in production).
- Confirm duplicate event suppression is active (event-id cache in webhook handler).
- Confirm durable duplicate protection exists for payment intent processing via persisted payment records (`stripePaymentIntentId` uniqueness + `getPaymentByStripeId` checks).

## 3) Background processing model

- If using autoscaled/stateless runtime, do not rely on in-process schedulers alone.
- Ensure a scheduled worker/job runs reminder processing (`scheduled-payment-reminders` and enrollment reminders) on a predictable cadence.
- Confirm only one scheduler instance is active at a time (singleton guards are in place in-process).

## 4) Data integrity checks

- Verify scheduled payments are created with expected installment counts and due dates.
- Verify `payment_intent.succeeded` updates:
  - scheduled payment status
  - enrollment `totalPaid` and `remainingBalance`
  - payment history entries.
- Verify refunds update both payment history and enrollment balances.

## 5) Observability

- Capture and monitor:
  - webhook verification failures
  - webhook processing errors (500s)
  - scheduled payment processing failures
  - reminder job failures.
- Alert on sustained spikes in webhook failures or payment update errors.

## 6) Smoke test (Stripe test mode against production-like env)

1. Create an enrollment with a split/deposit plan.
2. Complete initial checkout and verify:
   - enrollment state transitions
   - payment history created.
3. Trigger a webhook replay for the same event and confirm no double updates.
4. Trigger a refund and verify balance/payment history adjustments.
5. Validate parent-visible billing summary after each step.

## 7) Rollback readiness

- Be ready to disable autopay UI entry points if webhook processing degrades.
- Keep a manual reconciliation playbook for:
  - charged-but-not-enrolled,
  - duplicate update remediation,
  - missed scheduled-payment capture follow-up.
