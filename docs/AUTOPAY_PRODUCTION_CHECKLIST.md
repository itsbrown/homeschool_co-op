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

---

## 8) Environment variables (this repository)

Production/staging containers should define at minimum (names only; rotate secrets independently of this doc):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Drizzle/db pool; autopay enrollments/payments/schedules persist here. Required for durable production behavior (`server/db.ts`). |
| `STRIPE_SECRET_KEY` | Server-side Stripe API (`server/config/stripe.ts`). Live keys only in prod. |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe signatures on **`POST /api/stripe/webhook`** (`server/index.ts`, `server/webhook-handler.ts`). Must match the secret for that URL in the Stripe Dashboard. |
| `SUPABASE_URL` | Required in **`NODE_ENV=production`** at startup (`server/index.ts`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Same; used for JWT verification paths in billing and admin flows. |

Optional / feature-specific: `SUPABASE_ANON_KEY`, `BREVO_API_KEY`, Twilio-related vars, `OPENAI_API_KEY`, `REPLIT_*` for Replit-hosted Stripe connectors.

**Stripe CLI vs server:** Stripe CLI defaults (`stripe login`) may use a different account than `STRIPE_SECRET_KEY`. For local smoke testing, align keys or pass `--api-key` with the same secret the server uses.

## 9) Build and runtime shape

- **`npm run build`**: Runs Vite client build plus **esbuild** of `server/index.ts` → `dist/index.js`. The esbuild step **inlines `process.env.NODE_ENV` as `"production"`** so test-only code paths do not ship in the bundle (see `package.json`).
- **`npm start`**: Runs `NODE_ENV=production node dist/index.js`. Use this shape for staging/prod parity.
- **`npx tsx server/index.ts`**: Unbundled dev; preserves real `NODE_ENV` (e.g. `development`) — use when debugging or avoiding bundle differences.

Serve static SPA assets as your deploy already configures (many setups copy `dist/public` next to the server bundle or behind a CDN).

## 10) Background jobs vs hosting model

The app starts several **in-process** timers in **development** (and guarded paths elsewhere): enrollment reminders (`server/services/enrollmentReminderScheduler.ts`), scheduled payment reminders (`server/services/scheduled-payment-reminders.ts`), membership jobs (`server/index.ts`). **Autoscale/multi-instance deployments** won’t reliably run exactly one singleton across replicas.

Operational choices:

1. Run a **designated singleton** (Reserved VM / single worker dyno / one Replit Scheduled Deployment) whose job includes calling your reminder-processing entry points on a cron, **or**
2. Extract reminder logic behind a queue/cron elsewhere and disable duplicate timers per instance via platform config once you consolidate.

Singleton **in-process** guards only prevent double registration **inside one Node process**.

## 11) Code map (quick audit)

| Area | Location |
|------|----------|
| Raw webhook route + Stripe signature | `server/index.ts` (`POST /api/stripe/webhook`), `server/webhook-handler.ts` |
| Stripe routes (PaymentIntents, checkout-adjacent) | `server/api/stripe.ts`, `server/api/billing.ts`, `server/api/stripe-webhook.ts` |
| Scheduled payment HTTP API | `server/api/scheduled-payments.ts` |
| Stored payments / idempotency lookup | `server/storage.ts`, webhook handler `getPaymentByStripeId`-style guards |
