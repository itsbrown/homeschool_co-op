---
name: asa-notifications-errors
description: In-app notification system, error tracking with database logging, automatic admin notifications, frontend error capture, and system error monitoring for the ASA Learning Platform. Use when working with notifications, error logging, error telemetry, admin error alerts, or the notification delivery pipeline.
---

# ASA Notification & Error Monitoring

## Core Rules

- **Two separate systems**: Notifications (user-facing messages) and Error Monitoring (system health tracking) — don't conflate them
- **Notifications are multi-channel**: `email`, `in_app`, `sms`, `both` (email + in-app), `all` (all channels)
- **Error logs are database-backed** — every error is persisted in `error_logs` table with full context
- **Frontend errors auto-captured** — `errorTracker` in `client/src/lib/errorTracker.ts` captures and sends to backend
- **Critical/high severity errors trigger immediate admin email** via Brevo SMTP

## Notification System

### Notification Schema
```
notifications:
  senderId      → users.id (who sent it)
  schoolId      → schools.id (school context)
  type          → email | in_app | sms | both | all
  priority      → low | normal | high | urgent
  subject       → notification title
  content       → notification body
  targetType    → individual | role | all_parents | enrolled_parents | class_specific | missed_payments | ...
  targetData    → JSON with targeting details
  targetClassId → optional class filter
  targetUserIds → optional specific user IDs
  isAnnouncement → boolean (pinnable)
  status        → draft | scheduled | sending | sent | failed
  scheduledFor  → optional future send time
```

### Notification Recipients
Each notification generates per-user recipient records for delivery tracking:
```
notification_recipients:
  notificationId → notifications.id
  recipientId    → users.id
  deliveryType   → email | in_app | sms
  status         → pending | sent | delivered | read | failed
  readAt         → timestamp when user read it
  errorMessage   → delivery failure reason
```

### Target Types
| Target | Audience |
|--------|----------|
| `individual` | Specific user(s) by ID |
| `role` | All users with a specific role at a school |
| `all_parents` | All parents at a school |
| `enrolled_parents` | Parents with active enrollments |
| `unenrolled_parents` | Parents without enrollments |
| `class_specific` | Parents of students in a specific class |
| `missed_payments` | Parents with overdue payments |
| `all` | Everyone at a school |

### Unread Count (Frontend)
```typescript
const { data: notifications } = useQuery<Notification[]>({
  queryKey: ['/api/notifications'],
});
const unreadCount = notifications.filter(n => n.recipientStatus !== "read").length;
```
- Unread badge shown in educator sidebar and mobile header
- Polling via TanStack Query (no WebSocket — uses `staleTime: Infinity` with manual invalidation)

## Error Monitoring System

### Error Log Schema
```
error_logs:
  errorType    → frontend | backend | api | database | auth | payment | unknown
  severity     → low | medium | high | critical
  message      → error message text
  stackTrace   → full stack trace
  errorCode    → HTTP status or custom code
  url          → URL where error occurred
  route        → API route or page route
  method       → HTTP method
  userId       → authenticated user (if any)
  userEmail    → user email (if any)
  schoolId     → school context (if any)
  ipAddress    → request IP
  userAgent    → browser/client info
  requestBody  → sanitized request body (no PII)
  metadata     → { componentStack, breadcrumbs, custom data }
  status       → new | acknowledged | investigating | resolved | ignored
  resolvedBy   → admin who resolved it
  notificationSent → whether admin was emailed
```

### Frontend Error Capture
The `ErrorTracker` class in `client/src/lib/errorTracker.ts` automatically captures:
- API errors (non-2xx responses) via `captureApiError()`
- 404 errors via `captureApi404()`
- Navigation breadcrumbs for debugging context
- Component stack traces

```typescript
import { captureApiError, captureApi404 } from '@/lib/errorTracker';

captureApiError(message, statusCode, url, method, metadata);
captureApi404(url, method, metadata);
```

### Backend Error Telemetry
- **Frontend errors**: `POST /api/telemetry/frontend` — captures client-side errors with user context
- **Backend errors**: `POST /api/telemetry/backend` — captures server-side errors
- Both endpoints validate input with Zod schemas
- User context (email, userId, schoolId) extracted from auth if available

### Admin Error Notifications
The `ErrorNotificationService` (`server/services/error-notification.ts`) sends email alerts:
- **Immediate notification** for `critical` and `high` severity errors via Brevo SMTP
- Email includes: error ID, type, severity, message, stack trace, URL, user info
- Sent to `ERROR_NOTIFICATION_EMAIL` (defaults to `errors@americanseekersacademy.com`)
- Only sends if Brevo API key (`BREVO_API_KEY`) is configured

### Error Resolution Workflow
```
new → acknowledged → investigating → resolved
                                   → ignored
```
- Admins can update status and add resolution notes
- `resolvedBy` and `resolvedAt` tracked for accountability

## Telemetry Safety
- `apiRequest` in `queryClient.ts` skips error capture for `/api/telemetry/` endpoints to avoid infinite loops
- Request bodies are sanitized (no PII) before storage
- Stack traces truncated to 2000 chars in email notifications

## Common Pitfalls

- **Telemetry loop** → error tracker captures its own telemetry endpoint failures → `apiRequest` in `queryClient.ts` already excludes `/api/telemetry/` URLs from capture — never remove that exclusion
- **Missing Brevo key** → error emails silently fail → check `BREVO_API_KEY` is set; service logs warning if missing
- **Notification not delivered** → created notification but no recipient records → must create `notification_recipients` entries for each target user
- **Unread count stale** → notification read but badge still shows → invalidate `['/api/notifications']` query after marking as read
- **PII in error logs** → sensitive data stored in `requestBody` → sanitize request bodies before passing to error telemetry

## Best Practices

### Do
- Always create `notification_recipients` records when sending notifications — the notification itself is just metadata
- Always exclude `/api/telemetry/` from error capture to prevent infinite loops
- Always sanitize request bodies before logging — strip passwords, tokens, and PII
- Always use the `ErrorNotificationService` for critical/high severity alerts — don't build custom email logic
- Always invalidate the notifications query cache after read/dismiss actions
- Always set `schoolId` on notifications for multi-tenant filtering

### Don't
- Don't mix up notifications (user-facing) with error logs (system monitoring) — they're separate systems
- Don't send admin error emails without Brevo configured — check `brevoClient` is not null first
- Don't store raw request bodies with sensitive data — use sanitized versions only
- Don't rely on unread count from notification objects alone — use `recipientStatus` on `notification_recipients`
- Don't create notifications without a `senderId` — it's a required field
- Don't skip error type classification — `errorType` helps with triage and filtering

## Key Files
- `server/api/notifications.ts` — notification CRUD, send, mark-read endpoints
- `server/api/error-telemetry.ts` — frontend/backend error intake endpoints
- `server/services/error-notification.ts` — `ErrorNotificationService`, Brevo email alerts
- `client/src/lib/errorTracker.ts` — `ErrorTracker` class, `captureApiError`, `captureApi404`
- `client/src/lib/queryClient.ts` — telemetry exclusion in `apiRequest`
- `server/api/announcements.ts` — announcement-specific notification endpoints
- `server/services/web-push.ts` — web push notification service
- `server/api/push-subscriptions.ts` — push subscription management
- `shared/schema.ts` — `notifications`, `notificationRecipients`, `errorLogs` tables
