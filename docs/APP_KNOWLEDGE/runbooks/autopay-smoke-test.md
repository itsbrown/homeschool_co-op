# AutoPay end-to-end smoke test (Stripe CLI, test mode)

Validates the **full autopay loop** against real Stripe behavior without spending real money:

```
off-session PaymentIntent.create(confirm:true)
  → Stripe processes the test charge
    → Stripe fires payment_intent.succeeded
      → POST /api/stripe/webhook (signature-verified)
        → DB commit (scheduled_payment=completed, payments row, enrollment balance, receipt)
          → reconciliation heals any missed webhook from Stripe truth
```

It exercises two helper scripts:

- `server/scripts/autopay-preflight.ts` — read-only config/data check (run first).
- `server/scripts/autopay-smoke.ts` — orchestrates seed → charge → assert → reconcile → cleanup.

> **Safety.** `autopay-smoke.ts` refuses to run with a live key (`sk_live…`) or `NODE_ENV=production`, and only operates on rows it created (`metadata.smokeTest === true`). Run it against a **dev/staging DB with a Stripe TEST key only.** It does mutate the DB and create test-mode PaymentIntents.

---

## 1) Prerequisites

- A dev/staging environment with the app's normal env loaded (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, etc.).
- A **Stripe test secret key** exported as `STRIPE_SECRET_KEY=sk_test_…`.
- The [Stripe CLI](https://docs.stripe.com/stripe-cli) installed and logged into the **same** test account (`stripe login`).
- The app server runnable locally (default port `5000` — adjust below to match yours).
- A test parent **user** in the DB with at least one non-cancelled enrollment.

---

## 2) One-time: give the test parent a Stripe customer + default card

The off-session charge needs `users.stripeCustomerId` + a default card on that customer. Using the Stripe CLI / API in **test mode**:

```bash
# Create a test customer with a default test card (Visa) in one step:
stripe customers create \
  --email "test.parent@example.com" \
  --payment-method pm_card_visa \
  --invoice-settings "default_payment_method=pm_card_visa"
# → note the returned customer id: cus_XXXX
```

Then set that `cus_XXXX` as the parent's `stripeCustomerId` in your dev DB (SQL or admin tooling), e.g.:

```sql
UPDATE users SET stripe_customer_id = 'cus_XXXX' WHERE email = 'test.parent@example.com';
```

Verify readiness:

```bash
npx tsx server/scripts/autopay-smoke.ts setup --parent=test.parent@example.com
# Expect: "✅ setup OK — ready to seed + charge."
```

---

## 3) Terminal layout (3 terminals)

**Terminal A — app server**

```bash
# however you boot the app in dev, e.g.:
npx tsx server/index.ts
```

**Terminal B — Stripe CLI webhook forwarder**

```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
# It prints:  Ready! Your webhook signing secret is whsec_XXXX
```

Copy that `whsec_XXXX` and make it the server's `STRIPE_WEBHOOK_SECRET`, then **restart Terminal A** so the webhook handler verifies signatures against the CLI's secret:

```bash
export STRIPE_WEBHOOK_SECRET=whsec_XXXX
```

**Terminal C — orchestrator** (runs the smoke commands below)

---

## 4) Happy path: charge → webhook → commit

Run in **Terminal C**, with `stripe listen` (Terminal B) running:

```bash
# (a) optional preflight
npx tsx server/scripts/autopay-preflight.ts --charge-preview --limit=5

# (b) seed a small due installment ($5.00) flagged as a smoke-test row
npx tsx server/scripts/autopay-smoke.ts seed --parent=test.parent@example.com --amount=500
# → "✅ Seeded scheduled payment id=<ID> ..."

# (c) create + confirm the off-session PaymentIntent for that row
npx tsx server/scripts/autopay-smoke.ts charge --id=<ID>
# Terminal B should show: payment_intent.succeeded forwarded -> 200
# Terminal A should log the scheduled_payment completion + ledger write

# (d) assert the loop committed
npx tsx server/scripts/autopay-smoke.ts assert --id=<ID>
```

**Expected `assert` output:**

```
✅ scheduled_payment status == completed
✅ payments ledger row exists & completed
✅ enrollment has totalPaid > 0
✅ SMOKE PASS
```

If `assert` fails on the first two checks, the charge happened at Stripe but the **webhook didn't commit** — check Terminal B (was the event forwarded? `200`?) and that `STRIPE_WEBHOOK_SECRET` matches the CLI secret.

---

## 5) Reconciliation path: missed-webhook recovery

This proves the system self-heals when Stripe charges succeed but the webhook never lands.

```bash
# (a) seed + charge again, but STOP `stripe listen` (Terminal B) first so the
#     webhook is intentionally missed. The row will sit in `processing`.
#     (Ctrl+C Terminal B, then:)
npx tsx server/scripts/autopay-smoke.ts seed   --parent=test.parent@example.com --amount=500
npx tsx server/scripts/autopay-smoke.ts charge --id=<ID2>

# (b) backdate the row past the stuck threshold (default 30 min) so reconciliation
#     will pick it up immediately instead of waiting:
npx tsx server/scripts/autopay-smoke.ts simulate-stuck --id=<ID2>

# (c) run reconciliation — it retrieves the PI status from Stripe (succeeded),
#     marks the row completed, and backfills the missing ledger row + balance.
npx tsx server/scripts/autopay-smoke.ts reconcile

# (d) confirm the backfill landed
npx tsx server/scripts/autopay-smoke.ts assert --id=<ID2>
# → ✅ SMOKE PASS  (completed via reconciliation, not the webhook)
```

---

## 6) Failure path (optional)

To exercise the decline path, attach a declining test card and charge:

```bash
# pm_card_chargeCustomerFail simulates an off-session decline (authentication_required / card_declined)
stripe customers update cus_XXXX --invoice-settings "default_payment_method=pm_card_chargeCustomerFail"
npx tsx server/scripts/autopay-smoke.ts seed   --parent=test.parent@example.com --amount=500
npx tsx server/scripts/autopay-smoke.ts charge --id=<ID3>
```

Expect the row to go to `processing` then `failed` (via `payment_intent.payment_failed` / the off-session error handler), `retryCount` to increment, and a failure notice in the logs. The enrollment balance must **not** change. Reset the default card to `pm_card_visa` afterward.

---

## 7) Teardown

```bash
npx tsx server/scripts/autopay-smoke.ts cleanup --id=<ID>
npx tsx server/scripts/autopay-smoke.ts cleanup --id=<ID2>
```

Test-mode PaymentIntents and any backfilled `payments`/balance rows are left intact (harmless in test mode). For a pristine state, reset your dev/staging DB.

---

## 8) Troubleshooting

| Symptom | Likely cause |
|--------|--------------|
| `charge` returns row still `pending`, no PI | Parent has no `stripeCustomerId`/default card → re-run `setup` (§2). |
| PI created but `assert` shows status not `completed` | Webhook not delivered/verified → check `stripe listen` is running and `STRIPE_WEBHOOK_SECRET` matches the CLI secret; restart the server after setting it. |
| `Refusing to run … LIVE key` | `STRIPE_SECRET_KEY` is `sk_live…` — export a `sk_test…` key. |
| `reconcile` finds 0 rows | Row not stale enough → run `simulate-stuck` first (stuck threshold is `AUTOPAY_PROCESSING_STUCK_MINUTES`, default 30). |
| Emails not arriving | `BREVO_API_KEY` unset or Brevo IP not whitelisted → check the `email_log` table / preflight §6. Emails are best-effort and never block the charge. |

---

## Code map

| Step | Code |
|------|------|
| Off-session charge | `server/services/autopay-off-session-charge.ts` (`runAutoPayOffSessionChargesForResults`) |
| Due selection / policy | `server/services/autopay-policy.ts`, `server/services/scheduled-payment-reminders.ts` (`processAutoPayExecutionPath`) |
| Webhook commit | `server/webhook-handler.ts` (`payment_intent.succeeded`, `paymentType === 'scheduled_payment'`) |
| Reconciliation | `server/services/autopay-reconciliation.ts`, `scheduled-payment-reminders.ts` (`runAutoPayStuckProcessingReconciliation`) |
| Config preflight | `server/scripts/autopay-preflight.ts` |
| This orchestrator | `server/scripts/autopay-smoke.ts` |

See also `docs/AUTOPAY_PRODUCTION_CHECKLIST.md` for the production go-live checklist.
