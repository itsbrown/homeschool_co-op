# Observability (Sentry, telemetry, email webhooks)

**Last updated:** 2026-07-23

## Error pipeline (dual write)

| Layer | Primary | Secondary |
|-------|---------|-----------|
| Frontend | `client/src/lib/errorTracker.ts` → `POST /api/telemetry/errors/frontend` → `error_logs` | Sentry when severity ≥ medium and not throttled/deduped |
| Backend | `error_logs` + admin email for critical/high | Sentry via `captureServerException` in `server/api/error-telemetry.ts` |
| Payments | `payment-flow-monitor`, post-payment verification | **Do not** replace — keep DB alerts |

**Init:** `initSentryServer()` in `server/index.ts` and `server/app-init.ts`; `initSentryClient()` in `client/src/main.tsx`.

**PII:** Shared scrubber `shared/sentry-scrub.ts` (`beforeSend` on both tiers). Ignores `Script error.` and ResizeObserver noise.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Server SDK |
| `VITE_SENTRY_DSN` | Client SDK (Vite build) |
| `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` | `production`, `staging`, etc. |
| `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` | Git SHA for release health |
| `SENDGRID_API_KEY` | Primary transactional email (`EMAIL_PROVIDER=sendgrid` default when set) |
| `EMAIL_PROVIDER` | `sendgrid` (default if key set) or `brevo` rollback |

## Progress report observability

- **Sentry spans:** `progress.report.pdf.generate`, `.download`, `.email` in `server/api/progress.ts`.
- **Audit events** (`audit_logs.action_type`): `progress_report_generated`, `progress_report_downloaded`, `progress_report_emailed` — see `server/lib/progress-report-audit.ts`.
- **Immutable snapshots:** `quarterly_progress_reports` with `template_version` + `pdf_sha256`.

## SendGrid webhook (stub)

- `POST /api/webhooks/sendgrid/events` — updates latest `email_log` row on `bounce` / `dropped` / `delivered`.
- Configure in SendGrid Event Webhook settings; verify signature in production before go-live.

## Email log pitfall (prod)

- Drizzle `emailLog` expects `created_at`; prod `email_log` may lack that column → `logEmailAttempt` errors after a successful SendGrid send. Delivery still works; do not treat log failure as send failure.
- School-admin platform update blast: `server/scripts/send-school-admin-platform-update.ts`.

## Recommended Sentry alerts

1. Spike in `progress.report` transaction failures.
2. `errorType=payment` grouped separately (link to payment-flow monitor dashboard).
3. Frontend error rate vs. `error_logs` count divergence (indicates throttling or ignore list).

## Key files

- `server/lib/sentry.ts`, `client/src/lib/sentry.ts`
- `server/api/error-telemetry.ts`
- `server/api/sendgrid-webhook.ts`
- `server/lib/progress-report-audit.ts`
- `docs/APP_KNOWLEDGE/domains/student-progress-assessments.md` — F-14 product surface
