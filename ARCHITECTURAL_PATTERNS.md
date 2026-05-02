# Architectural Patterns & Common Pitfalls

**Purpose**: Document high-level architectural decisions and patterns to prevent logic bugs that code checks alone can't catch.  
**Origin**: Lessons learned from Nov 22, 2025 bugs involving wrong data sources, missing defensive checks, and incorrect middleware usage.

## 1. Database as Single Source of Truth
**Rule**: PostgreSQL (via Drizzle ORM) is THE authoritative data source. Never trust JWT metadata for mutable user data.

**Why This Matters**:
```typescript
// ❌ WRONG - JWT metadata can be stale
const schoolId = req.user.app_metadata?.school_id; // Cached in token, could be old

// ✅ CORRECT - Always query database
const user = await storage.getUserByEmail(req.user.email);
const schoolId = user.schoolId; // Fresh from PostgreSQL
```

**Common Pitfall**:
- JWT tokens cache user metadata (like `school_id`) at login time
- If user data changes (e.g., school transfer), the token still has old values until re-login
- **Solution**: Query PostgreSQL for user data on every request via middleware

**Real Bug Example (Nov 22, 2025)**:
User had `schoolId=1` in database but JWT token had `school_id=2` (from previous school), causing access to wrong school's data.

## 2. Defensive React Query Patterns
**Rule**: Add `enabled` checks when queries depend on async data that may not be immediately available.

**Pattern**:
```typescript
// ❌ WRONG - Query fires before schoolId is ready
const { data: users } = useQuery({
  queryKey: ['/api/school-admin/users'],
});

// ✅ CORRECT - Wait for schoolId before querying
const { schoolId } = useSchoolAdmin(); // Async hook that fetches schoolId
const { data: users } = useQuery({
  queryKey: ['/api/school-admin/users'],
  enabled: !!schoolId, // Only query when schoolId exists
});
```

**When to Use**:
- Queries that depend on `useSchoolAdmin()` hook
- Queries that depend on user role/permissions
- Queries that need route params from async navigation
- Any query where the dependency might be null/undefined initially

**Real Bug Example (Nov 22, 2025)**:
UsersPage had infinite loading because query fired before `schoolId` was available, causing repeated failures and retries.

## 3. Proper Middleware Usage Patterns
**Rule**: Middleware should be used in route definitions, not called as functions inside handlers.

**Correct Usage**:
```typescript
// ✅ CORRECT - Middleware in route signature
router.get('/users', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  const schoolId = req.schoolId; // Already set by middleware
  // ... use schoolId
});

// ❌ WRONG - Calling middleware as function
router.get('/users', supabaseAuth, async (req: any, res) => {
  const schoolId = await requireSchoolContext(req, res); // Don't do this!
  if (schoolId === null) return;
  // ... use schoolId
});
```

**Why It Matters**:
- Middleware expects `next()` callback - calling as function causes runtime errors
- Proper middleware chains handle errors consistently
- Route signature pattern is more maintainable and clear

**Exception**:
If you need to call middleware logic imperatively, create a separate helper function (like `getSchoolIdFromRequest`) that doesn't expect `next()`.

## 4. Type Safety for Database Operations
**Rule**: Use consistent type conversions when moving data between middleware (string) and storage (number).

**Pattern**:
```typescript
// Middleware sets req.schoolId as STRING
req.schoolId = String(schoolId);

// In route handler:
const schoolId = req.schoolId; // This is a string

// For comparisons with DB values (also strings from Drizzle):
.where(eq(users.schoolId, String(schoolId))) // ✅ String comparison

// For storage method calls (expects number):
await storage.getStudentsBySchool(Number(schoolId)) // ✅ Convert to number
```

**Type Contract**:
- `req.schoolId`: Always a **string** (set by middleware)
- Database queries: Use **String()** for `eq()` comparisons
- Storage methods: Use **Number()** for method parameters

## 5. Multi-Role Context & School ID Extraction
**Rule**: Always prioritize user.schoolId first, then fall back to activeRoleId lookup for multi-role users.

**Pattern**:
```typescript
// Priority 1: Legacy schoolId field (most users have this)
if (user.schoolId !== null && user.schoolId !== undefined && user.schoolId > 0) {
  return user.schoolId;
}

// Priority 2: Active role lookup (for multi-role users with null schoolId)
if (user.activeRoleId) {
  const activeRoles = await db.select()
    .from(userRoles)
    .where(eq(userRoles.id, user.activeRoleId))
    .limit(1);
  
  if (activeRoles.length > 0 && activeRoles[0].schoolId) {
    return activeRoles[0].schoolId;
  }
}

// If neither exists, return null (user has no school context)
return null;
```

**Why This Order**:
- Most users have `user.schoolId` set (legacy field)
- Multi-role users may have `null` schoolId but use `activeRoleId` instead
- This ensures production continues working even if activeRoleId isn't set

## 6. API Endpoint School Context Checklist
When creating new school-scoped endpoints, verify:

- [ ] **Middleware**: Route uses `requireSchoolContext` in signature
- [ ] **Access Check**: Handler reads `req.schoolId` (not calling middleware)
- [ ] **Database Query**: Filters by `schoolId` to enforce multi-tenancy
- [ ] **Type Conversion**: Uses `String(schoolId)` for comparisons, `Number(schoolId)` for storage
- [ ] **Error Handling**: Returns 400/403 if schoolId is missing or invalid

**Template**:
```typescript
router.get('/my-endpoint', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId; // String from middleware
    
    // Query database with school isolation
    const results = await db.select()
      .from(myTable)
      .where(eq(myTable.schoolId, String(schoolId)));
    
    res.json(results);
  } catch (error) {
    console.error('Error in /my-endpoint:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
```

## 7. Frontend State Management Patterns
**Rule**: Don't rely on localStorage for critical auth state. Use Supabase session as source of truth.

**Pattern**:
```typescript
// ❌ WRONG - localStorage can be stale or manipulated
const user = JSON.parse(localStorage.getItem('user'));

// ✅ CORRECT - Query Supabase session
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;
```

**For Role Context**:
```typescript
// ✅ CORRECT - Fetch from database via API
const { data: userRoles } = useQuery({
  queryKey: ['/api/user/roles'],
  enabled: !!session?.user,
});
```

## 8. Token-based Invitation Flow Pattern
**Rule**: All invitation features (staff, role, parent, etc.) should follow this unified pattern for token management and acceptance.

**Core Principles**:

### 8.1 Single Token Lifecycle
```typescript
// ❌ WRONG - Generating new token on resend (breaks previous email links)
const invitationToken = generateInvitationToken();
await storage.updateRoleInvitation(id, {
  token: invitationToken,  // This invalidates old links!
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});

// ✅ CORRECT - Reuse existing token on resend
if (existingInvitation) {
  invitationToken = existingInvitation.token;  // Keep same token
  await storage.updateRoleInvitation(id, {
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  // Just extend expiry
    isActive: true,
    usedAt: null  // Reset if needed
  });
} else {
  invitationToken = generateInvitationToken();  // Only generate if new
}
```

**Why This Matters**:
- Recipients may have old email links they haven't clicked yet
- Generating new tokens breaks those links, causing 404 errors
- Resending should extend the expiry, not invalidate the token

### 8.2 Public Validation Endpoints
```typescript
// ✅ CORRECT - Public endpoints (no auth middleware) for invitation recipients
app.get("/api/public/role-invitations/validate", async (req, res) => {
  // No supabaseAuth middleware - recipients don't have accounts yet
  const { token } = req.query;
  const invitation = await supabaseStorage.getActiveRoleInvitation(token);
  // ...validate and return
});

app.post("/api/public/role-invitations/accept", async (req, res) => {
  // No supabaseAuth middleware - creates account on acceptance
  const { token } = req.body;
  // ...validate, create account, activate user
});
```

**Why This Matters**:
- Invitation recipients don't have accounts yet
- They can't authenticate to reach authenticated endpoints
- Public endpoints allow the "accept invitation → create account" flow

### 8.3 Server-side Token Validation
```typescript
// ❌ WRONG - Trusting client-provided data
const { email, role } = req.body;  // Can be forged

// ✅ CORRECT - Validate token server-side, extract data from database
const invitation = await storage.getActiveRoleInvitation(token);
if (!invitation) {
  return res.status(404).json({ message: "Invalid invitation" });
}
const { email, role } = invitation;  // Authoritative data from database
```

### 8.4 Unified Storage (role_invitations table)
Use `role_invitations` for ALL invitation types:
- Staff invitations (has schoolId)
- Admin role invitations
- Parent invitations
- Any future invitation type

**Schema includes**:
- `token` - Unique invitation token
- `email` - Recipient email
- `role` - Role being granted
- `schoolId` - For school-scoped invitations (null for global)
- `expiresAt` - Expiration timestamp
- `isActive` - Whether invitation can still be used
- `usedAt` - When invitation was accepted

### 8.5 DTO Mapping (snake_case → camelCase)
```typescript
// Database uses snake_case (Supabase/PostgreSQL convention)
// API responses should use camelCase (JavaScript convention)

function mapInvitationToDTO(invitation: any) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invited_by,  // snake_case → camelCase
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    isActive: invitation.is_active,
    usedAt: invitation.used_at
  };
}
```

### 8.6 Invitation Flow Checklist
When creating new invitation features, verify:

- [ ] **Token Reuse**: Resend operations keep existing token, only update expiresAt
- [ ] **Public Endpoints**: Validate/accept endpoints don't require authentication
- [ ] **Server Validation**: Token validated server-side, not trusting client data
- [ ] **Unified Storage**: Uses role_invitations table (not a new table)
- [ ] **DTO Mapping**: API responses use camelCase field names
- [ ] **Account Creation**: Accept endpoint handles creating Supabase account if needed
- [ ] **Activation**: Accept endpoint activates the user/staff record in database

**Real Bug Example (Dec 2025)**:
Staff invitation resend was generating new tokens, breaking previously sent email links. Fixed by reusing existing token and only updating the expiry date.

---

# Money-Path Safety Patterns (Task #203 Sweep, May 2026)

The following eight patterns were derived from the Task #203 full payment-flow E2E sweep, which surfaced bug classes that the existing Nov-22 patterns did not catch. Each section uses the same format as the sections above (rule, why-it-matters, wrong/right pattern, real-bug example referencing the Task #203 finding number).

## 9. Webhooks Are Not the Source of Truth — DB Writes Are
**Rule**: A webhook handler that returns `200 {handled:true}` without a verifiable DB write has not "handled" anything. Every payment-bearing webhook must end with a row in `stripe_payment_history` (or `refunds`, `payment_allocations`, etc.) that can be SELECTed by `(stripe_event_id, payment_intent_id)`.

**Why This Matters**:
Stripe treats `2xx` as "delivered, do not retry". If the handler logs success but skips the DB write (e.g., metadata-based skip-path, env-flag gate, swallowed exception), the platform will never know the payment happened. Payment history shows nothing, scheduled payments don't generate, balances don't update, refunds don't reconcile — and Stripe will not redeliver because it already saw `2xx`.

```typescript
// ❌ WRONG — handler "succeeds" without persisting anything
app.post('/api/stripe/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);
  if (isCheckoutOriginated(event)) {
    // skip — checkout endpoint will persist this
    return res.json({ received: true, handled: true });
  }
  // ... rest of handler
});
```

```typescript
// ✅ CORRECT — handler proves persistence before returning 2xx
app.post('/api/stripe/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);
  const result = await persistPaymentEvent(event); // throws on DB error
  if (!result.rowId) {
    logger.error({ event: event.id, type: event.type }, 'webhook handler produced no DB row');
    return res.status(500).json({ received: true, handled: false, reason: 'no_persistence' });
  }
  return res.json({ received: true, handled: true, rowId: result.rowId });
});
```

**Real Bug Example (Task #203 finding #1)**:
`POST /api/stripe/webhook` returned `200 {handled:true}` for cart-originated `payment_intent.succeeded` events but wrote nothing to `stripe_payment_history`, `refunds`, or `program_enrollments`. The cascade broke payment history (#15), receipts, refunds (#18), scheduled payments (#11), and balance updates (#20) — six failing scenarios driven by one silent skip-path.

## 10. Money-Creating Endpoints Require Application-Level Idempotency
**Rule**: Every endpoint that creates a Stripe PaymentIntent, SetupIntent, Refund, or scheduled payment must be idempotent on `(userId, snapshotId)` — or accept and honor an `Idempotency-Key` header. Stripe's own idempotency key is necessary but not sufficient: it protects Stripe-side state, not the rows our application creates alongside the PI.

**Why This Matters**:
A double-tapped "Pay Now" button, a network retry, or a duplicate webhook can fire the same `/create-payment-intent` call twice in <100ms. Without an app-level guard, the server creates two PaymentIntents and two `program_enrollments` rows for the same cart. If both PIs are then confirmed (by the user or by a retried frontend mutation), the family is double-charged for the same enrollment.

```typescript
// ❌ WRONG — no guard; two parallel calls produce two PIs and two enrollments
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  const { trustedSnapshotId, total } = req.body;
  const enrollment = await storage.createEnrollment({ ... });
  const pi = await stripe.paymentIntents.create({ amount: total, ... });
  return res.json({ paymentIntentId: pi.id, enrollmentIds: [enrollment.id] });
});
```

```typescript
// ✅ CORRECT — per-(userId, snapshotId) lock returns the same PI on retry
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  const { trustedSnapshotId, total } = req.body;
  const lockKey = `pi:${req.user.id}:${trustedSnapshotId}`;
  const existing = await storage.getPaymentIntentForSnapshot(req.user.id, trustedSnapshotId);
  if (existing) return res.json({ paymentIntentId: existing.id, enrollmentIds: existing.enrollmentIds });
  return await withAdvisoryLock(lockKey, async () => {
    const again = await storage.getPaymentIntentForSnapshot(req.user.id, trustedSnapshotId);
    if (again) return res.json({ paymentIntentId: again.id, enrollmentIds: again.enrollmentIds });
    const enrollment = await storage.createEnrollment({ ... });
    const pi = await stripe.paymentIntents.create(
      { amount: total, ... },
      { idempotencyKey: lockKey },
    );
    await storage.recordPaymentIntentForSnapshot(req.user.id, trustedSnapshotId, pi.id, [enrollment.id]);
    return res.json({ paymentIntentId: pi.id, enrollmentIds: [enrollment.id] });
  });
});
```

**Real Bug Example (Task #203 finding #6b)**:
Two parallel POSTs to `/api/stripe/create-payment-intent` with identical body and identical `trustedSnapshotId` returned two different PIs (`pi_…RBgJ` and `pi_…2yCl`) and two different enrollment IDs (`11` and `12`). Stripe's PI-level dedup protected against double-charging the same PI (#6 PASS), but the app-level dup created two enrollments and two chargeable PIs — either of which a confirmed-twice mutation would charge.

## 11. Test Seeds Must Persist to the Same Storage as Production
**Rule**: Test-seed endpoints (`/api/test/setup-*`) must write to Postgres via the same storage interface as production code. Any silent fallback to MemStorage on a DB error must be replaced with a hard `5xx` failure that surfaces the underlying constraint violation.

**Why This Matters**:
A seed that silently falls back to MemStorage hides schema-violating bugs and creates rows that downstream tests cannot SELECT. The test suite passes, the seed endpoint returns `200`, and the next API call ("get this enrollment by ID") returns `404` because the row only exists in process memory. This made multiple Task #203 scenarios un-testable end-to-end (the seed worked, but every downstream lookup failed).

```typescript
// ❌ WRONG — silent fallback masks a real schema violation
app.post('/api/test/setup-cart-scenario', async (req, res) => {
  try {
    const enrollment = await dbStorage.createEnrollment({ ... }); // missing child_name
    return res.json({ enrollmentId: enrollment.id });
  } catch (err) {
    const enrollment = await memStorage.createEnrollment({ ... });
    return res.json({ enrollmentId: enrollment.id }); // 200, but row only in memory
  }
});
```

```typescript
// ✅ CORRECT — populate every NOT NULL column; fail loudly on DB error
app.post('/api/test/setup-cart-scenario', async (req, res) => {
  const enrollment = await dbStorage.createEnrollment({
    childName: child.fullName, // every NOT NULL column populated
    ...
  });
  // round-trip to confirm persistence — never trust the create-call return
  const verify = await dbStorage.getEnrollmentById(enrollment.id);
  if (!verify) return res.status(500).json({ error: 'seed not persisted', enrollmentId: enrollment.id });
  return res.json({ enrollmentId: enrollment.id });
});
```

**Real Bug Example (Task #203 finding #8)**:
`/api/test/setup-cart-scenario` hit `null value in column "child_name" of relation "program_enrollments"` on every call and silently fell back to MemStorage. The seed returned `200` with an enrollment ID, but `POST /api/payment-history/manual` (#17) returned `400 "Enrollment not found"` because its lookup hit Postgres, not MemStorage. The MemStorage fallback hid both the seed bug and the manual-payment auth-success-then-data-fail downstream.

## 12. Generated and Derived Columns Need Drift Checks
**Rule**: Any PostgreSQL `GENERATED ALWAYS AS` column (or any application-derived field stored alongside its inputs) must have a periodic drift check that asserts `COUNT(*) FILTER (WHERE col != formula(...)) = 0`. Never write directly to a generated column from application code — always update the input columns and let the generator recompute.

**Why This Matters**:
Generated columns are only enforced for rows created or updated *after* the `GENERATED` constraint is added. Rows created before the constraint, or rows touched by a `UPDATE program_enrollments SET effective_balance = ...` (which Postgres rejects, but only if the constraint is in force), can drift permanently. Drift in `effective_balance` directly translates to wrong "you owe $X" displays for parents and wrong outstanding-balance totals in admin reports.

```sql
-- ❌ WRONG — direct write to generated column (rejected by Postgres if generated, but
-- silently succeeds against legacy rows where the column was once a regular column)
UPDATE program_enrollments
SET effective_balance = total_cost - total_paid
WHERE id = $1;
```

```sql
-- ✅ CORRECT — periodic drift query (run in CI; fail build if drift > 0)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (
    WHERE effective_balance != GREATEST(
      0,
      COALESCE(total_cost, 0) - COALESCE(total_paid, 0) - COALESCE(comp_amount_cents, 0)
    )
  ) AS drift
FROM program_enrollments;
-- assert drift = 0 in CI; if not, run a one-shot backfill before merging
```

**Real Bug Example (Task #203 finding #19)**:
`effective_balance` drift on `19 of 240` enrollments (~8%). Legacy rows created before the `GENERATED` constraint was added retained stale values, so admin balance reports and parent "you owe" displays disagreed for ~8% of families with no error or warning anywhere in the logs.

## 13. SPA `*` Handler Must Not Shadow API Routes
**Rule**: The SPA catch-all `app.get('*', ...)` must be the very last `app.use` registered in `server/index.ts`, and it must explicitly skip any path beginning with `/api/`. A boot-time self-check should hit each registered `/api/*` route prefix and assert the response is not `<!DOCTYPE html>`.

**Why This Matters**:
If a real API route is unmounted (router-mount typo, conditional registration, mount-order regression), the SPA `*` handler catches the request and returns the SPA HTML with `200`. Frontend code that calls the route gets a `200` with HTML body, JSON.parse fails silently or surfaces as a confusing error, and the actual server-side error (`500`, `404`, missing-route) is masked. The user sees "nothing happens when I click Send" — there is no signal anywhere that the route is missing.

```typescript
// ❌ WRONG — SPA handler catches /api/* requests for unmounted routes
app.use('/api/financial-reports', financialReportsRouter); // mounted, but…
app.get('*', (req, res) => res.sendFile(indexHtml)); // …catches missing sub-paths
```

```typescript
// ✅ CORRECT — SPA handler explicitly skips /api/*; boot-time self-check
app.use('/api/financial-reports', financialReportsRouter);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next(); // let Express produce a real 404
  return res.sendFile(indexHtml);
});

// at boot, after all routes registered:
for (const prefix of ['/api/financial-reports', '/api/payment-history', /* … */]) {
  const probe = await fetch(`http://localhost:${PORT}${prefix}/__healthz`);
  const body = await probe.text();
  if (body.startsWith('<!DOCTYPE html>')) {
    throw new Error(`SPA catch-all is shadowing ${prefix} — refusing to start`);
  }
}
```

**Real Bug Example (Task #203 finding #16)**:
`POST /api/financial-reports/send-summary-reminder` is defined in `server/api/financial-reports.ts:1259` but responded with `200 <!DOCTYPE html>...`. The SPA `*` handler caught it because the `/api/financial-reports` router was either unmounted or shadowed by an earlier route. Parents and admins could not trigger summary emails, and there was no error in any log.

## 14. Snapshot and Commit Endpoints Must Agree on Every Flag
**Rule**: When the cart flow is split into a snapshot endpoint (`/api/cart/snapshot`) and a commit endpoint (`/api/stripe/create-payment-intent`), both must compute every shared flag (`isFreeEnrollment`, `availableCredits`, `payable`, `paymentPlans`) from the same code path. A paired integration test must take the raw snapshot output and feed it into the commit endpoint without modification.

**Why This Matters**:
If the snapshot computes `payable=0, isFreeEnrollment=true` but the commit endpoint independently re-derives `total > 0` (or rejects `total=0` outright), free enrollments and 100%-credit payments are silently broken. The user sees "Confirm Free Enrollment" on the cart, clicks it, and gets `409 UNIFIED_TOTAL_MISMATCH` from the server — a confusing failure that looks like a frontend bug but is really two endpoints disagreeing about the same fact.

```typescript
// ❌ WRONG — snapshot says "free", commit re-derives and rejects
// snapshot endpoint:
return { payable: 0, isFreeEnrollment: true, availableCredits: 10000, ... };
// commit endpoint:
if (total === 0) return res.status(409).json({ code: 'UNIFIED_TOTAL_MISMATCH' });
```

```typescript
// ✅ CORRECT — both endpoints call the same helper; paired test guards parity
import { computeCartPricing } from '@/lib/cart-pricing';
// snapshot endpoint:
const pricing = await computeCartPricing(cart, user);
return { ...pricing }; // { payable, isFreeEnrollment, availableCredits, ... }
// commit endpoint:
const pricing = await computeCartPricing(cart, user);
if (pricing.payable === 0 && pricing.isFreeEnrollment) {
  return await commitFreeEnrollment(cart, user); // dedicated zero-dollar path
}
```

**Real Bug Example (Task #203 findings #9, #10)**:
Snapshot correctly returned `payable=0, isFreeEnrollment=true` for a 100%-credit cart (#9) and `payable=5000` for a partial-credit cart (#10). Both commit calls returned `409 UNIFIED_TOTAL_MISMATCH`. The snapshot DTO also failed to surface `availableCredits` (returned `undefined` instead of `5000`), confirming the two endpoints used independent pricing paths.

## 15. Env-Flag-Gated Code Paths Must Fail Loud in Dev
**Rule**: Any production-required env flag (`PAYMENT_PROCESSOR_ENABLED`, `AUTO_PAY_SINGLE_INSTANCE`, `STRIPE_WEBHOOK_SECRET`, etc.) must throw at boot or at first use in dev when missing — never silently skip the gated work. If a flag legitimately needs to be off in dev, the missing branch must log at WARN with the specific feature being skipped and the env-flag name to set.

**Why This Matters**:
A silent env-flag skip looks identical to "the feature works" until a downstream test or the user notices the missing side-effect. The Task #203 webhook silent-fail (#1) was rooted in `PAYMENT_PROCESSOR_ENABLED` being unset in dev: the handler's persistence step was gated on the flag, the flag was missing, and the gate took the `return early` branch with no log line. Every webhook returned `200 {handled:true}` and wrote nothing.

```typescript
// ❌ WRONG — silent skip; caller sees success, no log line, no DB write
async function persistPaymentEvent(event: Stripe.Event) {
  if (process.env.PAYMENT_PROCESSOR_ENABLED !== 'true') return { rowId: null };
  // ... actual persistence
}
```

```typescript
// ✅ CORRECT — fail loud in dev; WARN with reason in prod if intentionally off
async function persistPaymentEvent(event: Stripe.Event) {
  if (process.env.PAYMENT_PROCESSOR_ENABLED !== 'true') {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'PAYMENT_PROCESSOR_ENABLED is not set to "true". ' +
        'Webhook persistence is disabled. Set the env var or remove the gate.'
      );
    }
    logger.warn({ event: event.id, type: event.type, flag: 'PAYMENT_PROCESSOR_ENABLED' },
      'webhook persistence skipped — env flag not set');
    return { rowId: null };
  }
  // ... actual persistence
}
```

**Real Bug Example (Task #203 finding #1, root cause)**:
`PAYMENT_PROCESSOR_ENABLED` was unset in dev. The webhook handler's persistence branch silently returned without logging. Six downstream Task #203 scenarios failed (#2, #11, #15, #18, #20, plus refund persistence) — all traceable to one missing log line in one env-flag gate.

## 16. Webhook Skip-Paths Must Log at WARN With Skip Reason
**Rule**: Any webhook handler branch that intentionally skips work (metadata signal, env flag, source-system filter) must log at WARN level with: the event ID, the event type, the skip reason, and the metadata key/value that triggered the skip. A silent skip is indistinguishable from a silent bug.

**Why This Matters**:
Webhook handlers accumulate skip-paths over time as new payment sources are added (cart, admin manual entry, Stripe-managed subscriptions, etc.). Each skip-path is correct in isolation, but a regression that broadens a metadata filter ("skip if `createdBy` starts with `asa_`") can silently swallow events the system used to persist. With no log line, the only signal is downstream emptiness — payment history pages with no rows, balance reports with stale totals.

```typescript
// ❌ WRONG — silent skip; no way to tell from logs why nothing happened
if (event.data.object.metadata?.createdBy === 'asa_payment_system') {
  return; // checkout endpoint will persist this
}
```

```typescript
// ✅ CORRECT — WARN with full context; downstream can grep for the skip reason
if (event.data.object.metadata?.createdBy === 'asa_payment_system') {
  logger.warn({
    eventId: event.id,
    eventType: event.type,
    paymentIntentId: event.data.object.id,
    skipReason: 'checkout-originated payment (metadata signal)',
    metadataKey: 'createdBy',
    metadataValue: event.data.object.metadata.createdBy,
  }, 'webhook skipped — checkout endpoint owns persistence');
  return;
}
```

**Real Bug Example (Task #203 finding #1, "checkout-originated payment metadata signal" skip-path)**:
`server/services/stripeWebhookHandlers.ts` contained a metadata-based skip-path for `createdBy: asa_payment_system` that silently returned without logging. Combined with the `PAYMENT_PROCESSOR_ENABLED` env-flag silent-skip (pattern #15), there was no log line anywhere proving the webhook had been "handled" by skipping it — making it impossible to distinguish "skipped by design" from "broken by regression" without reading source.

---

## 17. Post-Mortem Index

This index maps each Money-Path Safety pattern (sections 9–16 above) to the Task #203 finding(s) that motivated it and to the regression test that enforces it. Test paths are TODO placeholders pointing at `server/tests/integration/payment-flow/`, the directory being created in the parallel test-harness task.

| Pattern | Task #203 finding(s) | Regression test |
|---|---|---|
| [§9 Webhooks are not the source of truth — DB writes are](#9-webhooks-are-not-the-source-of-truth--db-writes-are) | #1, #2, #11, #15, #18, #20 | TODO: `server/tests/integration/payment-flow/webhook-persistence.test.ts` (see harness task) |
| [§10 Money endpoints require idempotency](#10-money-creating-endpoints-require-application-level-idempotency) | #2, #6b | TODO: `server/tests/integration/payment-flow/create-pi-idempotency.test.ts` (see harness task) |
| [§11 Test seeds must persist to the same storage as production](#11-test-seeds-must-persist-to-the-same-storage-as-production) | #8 (root cause for #15, #17) | TODO: `server/tests/integration/payment-flow/seed-persistence.test.ts` (see harness task) |
| [§12 Generated and derived columns need drift checks](#12-generated-and-derived-columns-need-drift-checks) | #19 | TODO: `server/tests/integration/payment-flow/effective-balance-drift.test.ts` (see harness task) |
| [§13 SPA `*` handler must not shadow API routes](#13-spa--handler-must-not-shadow-api-routes) | #16 | TODO: `server/tests/integration/payment-flow/spa-shadow-guard.test.ts` (see harness task) |
| [§14 Snapshot and commit endpoints must agree on every flag](#14-snapshot-and-commit-endpoints-must-agree-on-every-flag) | #9, #10 | TODO: `server/tests/integration/payment-flow/snapshot-commit-parity.test.ts` (see harness task) |
| [§15 Env-flag-gated paths must fail loud in dev](#15-env-flag-gated-code-paths-must-fail-loud-in-dev) | #1 (root cause: `PAYMENT_PROCESSOR_ENABLED`) | TODO: `server/tests/integration/payment-flow/env-flag-fail-loud.test.ts` (see harness task) |
| [§16 Webhook skip-paths must log at WARN](#16-webhook-skip-paths-must-log-at-warn-with-skip-reason) | #1 ("checkout-originated payment metadata signal" skip) | TODO: `server/tests/integration/payment-flow/webhook-skip-logging.test.ts` (see harness task) |
