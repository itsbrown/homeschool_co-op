# Development Testing Checklist

**Purpose**: Catch basic code issues (duplicate functions, shadowed imports, runtime errors) and money-path regressions before architect review.
**Origin**: Created in response to Nov 22, 2025 middleware import bug (sections below). Restructured May 2026 around money-path safety after the Task #203 sweep surfaced eight new bug classes (see `ARCHITECTURAL_PATTERNS.md` §9–§16 and the post-mortem index in §17).

## For Middleware/Import Changes
Before marking completed, verify:
- [ ] **Check for duplicate function definitions**
  ```bash
  # Search for ALL definitions of the function you're importing (regular functions + arrow functions)
  grep -rn "^function functionName\|^async function functionName" server/
  grep -rn "^export function functionName\|^export async function functionName" server/
  grep -rn "const functionName.*=.*=>\|const functionName.*=.*async.*=>" server/
  grep -rn "export const functionName.*=.*=>|export const functionName.*=.*async.*=>" server/
  ```
- [ ] **Verify import is not shadowed by local function**
  ```bash
  # After adding import, check the same file doesn't define it locally
  grep -n "import.*functionName" file.ts
  grep -n "function functionName\|async function functionName" file.ts
  grep -n "const functionName.*=" file.ts
  ```
- [ ] **Test affected endpoints** - Don't rely only on LSP (it misses runtime errors)
  - Test 2-3 endpoints that use the middleware
  - Check server logs for errors
  - Verify expected behavior (e.g., schoolId extracted correctly)
- [ ] **Architect review BEFORE marking completed** - Include git diff

## For Function Removal
Before marking completed, verify:
- [ ] **Search ALL files for remaining function calls**
  ```bash
  # Find all calls to the function you're removing
  grep -rn "functionName(" server/ client/
  ```
- [ ] **Check for local duplicates with same name**
  ```bash
  # Find all definitions across the codebase (regular + arrow functions)
  grep -rn "function functionName\|const functionName.*=.*function" .
  grep -rn "const functionName.*=.*=>" .
  ```
- [ ] **Verify no references in other files**
  ```bash
  # Search for any mention of the function
  grep -rn "functionName" --include="*.ts" --include="*.tsx"
  ```

## For Database Schema Changes
Before marking completed, verify:
- [ ] **Never change primary key ID types** (serial ↔ varchar breaks existing data)
- [ ] **Check existing schema first**
  ```bash
  # Query database to see current column types
  npm run db:studio
  ```
- [ ] **Use safe push command**: `npm run db:push --force` (never write manual migrations)
- [ ] **Test with actual data** - Don't just check LSP

---

# Money-Path Safety Checklists (Task #203, May 2026)

The following six top-level sections were added in response to the Task #203 sweep. Each section maps directly to one or more patterns in `ARCHITECTURAL_PATTERNS.md` §9–§16. Run every applicable checklist before marking work complete on any change that touches the money path.

## For Money-Path Changes
Applies whenever the change touches Stripe, payment intents, scheduled payments, refunds, credits, or balance computation. Maps to `ARCHITECTURAL_PATTERNS.md` §9, §10, §15.

- [ ] **Idempotency proof** — fire two parallel requests with identical body and identical `trustedSnapshotId`; both must return the same `paymentIntentId` and the same `enrollmentIds`.
  ```bash
  # Replace $TOKEN, $BODY with real values
  for i in 1 2; do curl -s -X POST http://localhost:5000/api/stripe/create-payment-intent \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$BODY" & done; wait
  # Compare paymentIntentId values — must be identical
  ```
- [ ] **Webhook DB-write proof** — after firing a signed test webhook, the corresponding row must exist in `stripe_payment_history` (or `refunds` for refund events).
  ```sql
  SELECT id, stripe_event_id, payment_intent_id, created_at
  FROM stripe_payment_history
  WHERE stripe_event_id = $1;
  -- expect exactly 1 row
  ```
- [ ] **Env-flag fail-loud check** — temporarily unset the relevant env flag (e.g., `PAYMENT_PROCESSOR_ENABLED`); the affected code path must throw in dev, not silently no-op.
  ```bash
  unset PAYMENT_PROCESSOR_ENABLED && npm run dev
  # Trigger the code path; expect a thrown error mentioning the missing flag.
  # Re-set the flag before continuing.
  ```
- [ ] **No new `fetch()` to a payment route** — all payment mutations must go through `apiRequest` from `client/src/lib/queryClient.ts`.
  ```bash
  rg "fetch\([\"'].*payment" client/ server/
  # Any match in client/ for a mutation is a regression — convert to apiRequest.
  ```

## For Webhook Changes
Applies to any change in `server/api/stripe.ts`, `server/services/stripeWebhookHandlers.ts`, or any new webhook handler. Maps to `ARCHITECTURAL_PATTERNS.md` §9, §16.

- [ ] **Every handler ends with a verifiable DB write** — the handler must return the row ID (or rows-affected count) it persisted; a `200 {handled:true}` with no `rowId` is forbidden.
- [ ] **Signed-webhook test required** — send a real `stripe.webhooks.generateTestHeaderString`-signed event to the handler and assert the DB row exists.
  ```sql
  -- Run before AND after firing the signed webhook; the diff must be exactly +1.
  SELECT COUNT(*) FROM stripe_payment_history WHERE created_at > NOW() - INTERVAL '5 minutes';
  ```
- [ ] **Skip-paths log at WARN** — every `return` branch that does not persist must call `logger.warn({eventId, eventType, skipReason, metadataKey, metadataValue}, ...)`. Verify by grepping the new branch:
  ```bash
  rg -A 3 "return;" server/services/stripeWebhookHandlers.ts | grep -i warn
  # Every skip-return must be preceded by a WARN log line.
  ```
- [ ] **Idempotent re-delivery** — fire the same signed event 3 times; the DB row count must increase by exactly 1, not 3.

## For Route Mounting Changes
Applies to any change in `server/index.ts`, `server/routes.ts`, or any router-mount call. Maps to `ARCHITECTURAL_PATTERNS.md` §13.

- [ ] **SPA `*` handler is the very last `app.use`** — confirm by grepping:
  ```bash
  grep -n "app.get('\\*'" server/index.ts
  grep -n "app.use" server/index.ts | tail -5
  # The SPA catch-all line number must be greater than every other app.use line number.
  ```
- [ ] **SPA handler explicitly skips `/api/*`**:
  ```bash
  grep -A 2 "app.get('\\*'" server/index.ts | grep "req.path.startsWith('/api/')"
  # Must match — the catch-all must call next() for /api/* paths.
  ```
- [ ] **Boot-time self-check passes** — every registered API prefix is hit during startup and must not return `<!DOCTYPE html>`. Failures must abort boot.
- [ ] **`curl` returns JSON not HTML for the new route**:
  ```bash
  curl -s -o /dev/null -w "%{content_type}\n" http://localhost:5000/api/your-new-route
  # Expect application/json. text/html means the SPA caught it — fix mount order.
  ```

## For Test Seed Changes
Applies to any change in `server/api/test-*.ts` or any `/api/test/setup-*` endpoint. Maps to `ARCHITECTURAL_PATTERNS.md` §11.

- [ ] **All NOT NULL columns populated** — list the table's NOT NULL columns and confirm the seed sets every one:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'program_enrollments' AND is_nullable = 'NO';
  ```
- [ ] **No silent MemStorage fallback** — grep the seed for any `catch` block that swaps to MemStorage and remove it; replace with `return res.status(500).json({...})`.
  ```bash
  rg -n "memStorage\." server/api/test-*.ts
  # Any match in a test seed is a fallback that must fail loud instead.
  ```
- [ ] **Round-trip query confirms persistence** — after the seed creates a row, the same handler must SELECT it back from Postgres and return `500` if not found.
- [ ] **Seed returns the real DB row ID** — never return a MemStorage ID; downstream tests will fail to look it up.

## For Generated-Column Changes
Applies to any change to `program_enrollments.effective_balance` or any other `GENERATED ALWAYS AS` column. Maps to `ARCHITECTURAL_PATTERNS.md` §12.

- [ ] **Drift query passes** — run the canonical drift check; `drift` must equal `0`:
  ```sql
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (
      WHERE effective_balance != GREATEST(
        0,
        COALESCE(total_cost, 0) - COALESCE(total_paid, 0) - COALESCE(comp_amount_cents, 0)
      )
    ) AS drift
  FROM program_enrollments;
  ```
- [ ] **No direct writes to the generated column** — grep for any code that writes the column name as an INSERT/UPDATE target:
  ```bash
  rg -n "effective_balance\s*[:=]" server/ shared/
  # Allowed: schema.ts definition only. Any UPDATE or INSERT setting the column is a bug.
  ```
- [ ] **Inputs to the formula are updated through the storage interface** — never `db.update().set({totalPaid: ...})` directly outside the sanctioned admin-correction endpoint (`PATCH /api/admin/enrollments/:id/correct-balance`).

## For Snapshot/Commit Endpoints
Applies to any change in `/api/cart/snapshot`, `/api/cart/calculate`, `/api/cart/validate`, or `/api/stripe/create-payment-intent`. Maps to `ARCHITECTURAL_PATTERNS.md` §14.

- [ ] **Paired test exists** — there must be an integration test that takes the snapshot output and feeds it into the commit endpoint without modification. The commit must succeed for every snapshot the user could legitimately submit.
- [ ] **Both endpoints call the same pricing helper** — grep both endpoints to confirm they import from the same source:
  ```bash
  rg -n "computeCartPricing|cartPricing" server/api/cart.ts server/api/stripe.ts
  # Both files must reference the same shared helper.
  ```
- [ ] **Every snapshot flag round-trips** — `isFreeEnrollment`, `availableCredits`, `payable`, `paymentPlans` returned by snapshot must each be re-derivable (or accepted as-is) by the commit endpoint. No snapshot field may be silently dropped.
- [ ] **Free-enrollment path tested** — feed a snapshot with `payable=0, isFreeEnrollment=true` into the commit endpoint; expect `200`, not `409 UNIFIED_TOTAL_MISMATCH`.

## General Pre-Completion Pattern
- [ ] **LSP only catches type errors** - Always test runtime behavior
- [ ] **Test the actual feature** - Click through UI or call API endpoints
- [ ] **Check server/browser logs** - Look for errors, warnings, unexpected output
- [ ] **Architect review catches issues** - Call before marking completed, not after
- [ ] **Include git diff in architect review** - Set `include_git_diff: true`

## Quick Verification Commands
```bash
# Find duplicate function definitions (regular functions)
grep -rn "^function extractSchoolId\|^async function extractSchoolId" server/

# Find duplicate function definitions (arrow functions)
grep -rn "const extractSchoolId.*=.*=>\|const extractSchoolId.*=.*async.*=>" server/

# Find all imports and local definitions (look for conflicts)
grep -n "import.*requireSchoolContext" server/api/school-admin.ts
grep -n "function requireSchoolContext\|const requireSchoolContext" server/api/school-admin.ts

# Count how many times a function is defined (should be 1)
grep -rn "^function myFunction\|const myFunction.*=" . | wc -l

# Find all calls to a function across codebase
grep -rn "myFunction(" --include="*.ts" --include="*.tsx"

# Money-path: find any direct write to a generated column
rg -n "effective_balance\s*[:=]" server/ shared/

# Money-path: find any bare fetch() to a payment route in the client
rg "fetch\([\"'].*payment" client/

# Route mounting: confirm SPA catch-all is last
grep -n "app.get('\\*'\|app.use" server/index.ts | tail -10
```
