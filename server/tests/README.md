# Integration Testing Guide

## Overview

This directory contains comprehensive integration tests for the ASA platform, covering 330+ test scenarios across 14 implementation phases.

## Structure

```
server/tests/
├── integration/          # Integration test suites
│   ├── phase1/          # Core platform features
│   │   ├── user-management.test.ts
│   │   ├── class-management.test.ts
│   │   ├── staff-management.test.ts
│   │   ├── student-management.test.ts
│   │   └── notifications.test.ts
│   ├── phase2/          # Financial & enrollment (to be implemented)
│   ├── phase3/          # AI features (to be implemented)
│   └── ...              # Phases 4-14
├── helpers/             # Test utilities
│   ├── testDatabase.ts  # Database test helpers
│   ├── apiHelpers.ts    # API test helpers
│   ├── mockServices.ts  # External service mocks
│   └── mockData.ts      # Test data generators
├── setup.ts             # Jest setup configuration
└── README.md            # This file
```

## Running Tests

### Prerequisites

1. **Database Setup**: Ensure you have a test PostgreSQL database running
   ```bash
   createdb asa_test
   ```

2. **Environment Variables**: Set up test environment
   ```bash
   export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/asa_test"
   export NODE_ENV=test
   ```

### Stabilization checklist (before merging payment / enrollment work)

Quick local gate (no full suite):

```bash
node scripts/run-stabilize-checks.mjs
```

1. **Schema (core + F001)** — on your dev or `asa_test` database only:
   ```bash
   # Add DATABASE_URL or TEST_DATABASE_URL to .env, then:
   npx drizzle-kit push --force
   node scripts/verify-core-schema.mjs
   node scripts/verify-f001-schema.mjs
   ```
   Or apply `server/migrations/f001-phase1-schema.sql` manually.

2. **Full server suite** (requires Postgres; `globalSetup` writes `.jest-cache/integration-db.json`):
   ```bash
   export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/asa_test"
   npm run test:server
   ```
   - DB-backed suites use `describeIntegration` and **skip** when Postgres is unreachable (not fail).
   - `testDb.cleanup()` clears MemStorage **and** truncates public Postgres tables between tests (**dedicated `asa_test` only**).

3. **Payment-flow / allocator HTTP suites** (`server/tests/integration/payment-flow/*`, `allocator-reallocation-atomicity.db.test.ts`) also need the **dev app on port 5000** (`npm run dev`) because they call `http://localhost:5000/api/test/*`.

4. **Triage**
   - `User with email … already exists` → wrong DB URL or truncation skipped.
   - `Database connection not available` → start Postgres / fix `TEST_DATABASE_URL`.
   - `fetch failed` on port 5000 → start `npm run dev` before payment-flow tests.

### Production-path lane (registration / locations — mandatory on PR)

Exercises **real HTTP routes** and **Postgres** (`asa_test`) with the same mount order as production (`public` locations before auth). Does **not** skip when the DB is down — fix `TEST_DATABASE_URL` or CI will fail.

| File | What it proves |
|------|----------------|
| `integration/production-path/public-registration-locations.test.ts` | `GET /api/public/registration/locations` — seeded campuses, no Main Campus auto-seed, no cross-school leak |
| `integration/production-path/location-school-context.test.ts` | Misaligned `users.school_id` vs `schools.admin_id`; `POST /api/locations` with explicit `schoolId` |
| `integration/production-path/school-validate-code.test.ts` | `GET /api/schools/validate-code/:code` |
| `integration/production-path/auth-register-school-signup.test.ts` | `POST /api/auth/register` + mocked Supabase admin → user, roles, children |
| `integration/production-path/auth-register-orphan-supabase.test.ts` | Orphan Supabase auth blocks signup (`AUTH_EMAIL_EXISTS`) |
| `integration/production-path/associate-parent-school.test.ts` | `associateParentWithSchool` storage path (no self-HTTP) |

**Run locally** (requires `asa_test` + `db:push`):

```bash
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/asa_test
export DATABASE_URL="$TEST_DATABASE_URL"
node scripts/db-push-with-env.mjs
PAYMENT_PROCESSOR_ENABLED=true npm run test:server -- --runInBand --testPathPatterns=production-path
```

**Seed for Playwright:** `POST /api/test/setup-registration-scenario` (see `e2e/school-code-registration.spec.ts`). E2E uses **real Supabase** when secrets are set; skips with placeholder keys.

Harness: `server/tests/helpers/productionPathApp.ts`, `supabaseAuthMock.ts`, `describeProductionPath.ts`, `seedRegistrationScenario.ts`.

### Session enrollment (F001) — E2E vs integration

| Layer | File | What it proves |
|-------|------|----------------|
| **E2E** | `e2e/session-enrollment-flow.spec.ts` | Parent wizard, open sessions API, `POST /api/session-enrollments` (authenticated). **No live Stripe.** |
| **Integration** | `server/tests/integration/session-enrollment-checkout.test.ts` | `create-payment-intent` + cart snapshot with **mocked** Stripe (`jest.mock` on `getStripeClient`). Requires a real `TEST_DATABASE_URL` (not the literal `...` placeholder). |
| **E2E checkout** | `e2e/parent-payment-flow.spec.ts` | Full UI checkout; needs valid `TESTING_STRIPE_SECRET_KEY` / `sk_test_*` in `.env` or secrets. |
| **E2E credits** | `e2e/credit-management-parent-lookup.spec.ts` | School-admin Add Manual Credit finds legacy parents (`users.school_id` only, no `user_roles`). Seed: `POST /api/test/setup-credit-lookup-scenario`. Requires `DATABASE_URL` + Supabase for admin login. |
| **E2E registration** | `e2e/school-code-registration.spec.ts` | `/register/:code` UI + live Supabase signup. Seed: `POST /api/test/setup-registration-scenario`. Skips without real `SUPABASE_SERVICE_ROLE_KEY`. |
| **Unit** | `server/tests/biweekly-checkout-contract.test.ts`, `server/tests/cart-program-dates.test.ts`, `server/tests/checkout-payment-plans-offer.test.ts`, `server/tests/biweekly-schedule-end-buffer.test.ts`, `server/tests/stripe-biweekly-checkout-phases.test.ts` | Golden fixture in `server/lib/biweekly-checkout-contract.ts` — cart, Stripe phases, boundary. |
| **Integration** | `server/tests/integration/biweekly-session-checkout.test.ts` | Session cart snapshot + `create-payment-intent` biweekly → `scheduled_payments` dates/amounts/autopay metadata. Requires reachable `TEST_DATABASE_URL` (see commands below). |

**Restore `users` after accidental test truncate (Supabase CSV)**

Integration `testDb.cleanup()` must only run against `asa_test`. If dev Postgres was truncated, restore Neon from Replit **or** import Supabase auth export into `users` / `user_roles` (passwords remain in Supabase only):

```bash
# Dry-run
DATABASE_URL="postgresql://..." npx tsx scripts/import-supabase-auth-users-from-csv.ts \
  --csv "$HOME/Downloads/Supabase Snippet SQL Query.csv"

# Apply
CONFIRM_SUPABASE_USER_IMPORT=1 DATABASE_URL="postgresql://..." npx tsx scripts/import-supabase-auth-users-from-csv.ts \
  --csv "$HOME/Downloads/Supabase Snippet SQL Query.csv" --apply
```

Then seed schools (required for `school_id` on import) and any app users missing from the Supabase export:

```bash
node scripts/seed-dev-schools.mjs
CONFIRM_SEED_DEV_SCHOOLS=1 node scripts/seed-dev-schools.mjs --apply

node scripts/import-app-users-from-csv.mjs --csv attached_assets/users_1761901890907.csv \
  --email contact.americanseekersacademy@gmail.com
CONFIRM_APP_USER_IMPORT=1 node scripts/import-app-users-from-csv.mjs --csv attached_assets/users_1761901890907.csv \
  --email contact.americanseekersacademy@gmail.com --apply
```

Check a login email: `node scripts/diagnose-login-user.mjs user@example.com`

Registration link / school code after restore:

```bash
node scripts/diagnose-school-code.mjs X8BMC1JE
# If missing, open My School as admin (auto-generates a code) or:
CONFIRM_SET_SCHOOL_CODE=1 node scripts/set-school-registration-code.mjs --school-id 1 --code X8BMC1JE --apply
```

`testDb.cleanup()` skips `TRUNCATE` unless the DB URL looks like a test database (or `ALLOW_TEST_TRUNCATE=1`).

**Biweekly pyramid (layer 1 → 2)**

In **zsh**, do not put `npm run` on the same line as `export` — you get `export: not valid in this context: test:server`. Set variables first, then run Jest (two commands), or prefix env vars without `export`:

```bash
# Layer 1 — golden contract (no Postgres)
npm run test:server -- --testPathPatterns="biweekly-checkout-contract|cart-program-dates|checkout-payment-plans-offer|biweekly-schedule-end-buffer|stripe-biweekly-checkout-phases"

# Layer 2 — set DB URL (line 1), then run tests (line 2)
export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/asa_test"
npm run test:server -- --testPathPatterns=biweekly-session-checkout --runInBand

# Layer 2 — one-liner alternative (no export)
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/asa_test" npm run test:server -- --testPathPatterns=biweekly-session-checkout --runInBand
```

Do not add `create-payment-intent` to session E2E — it fails with Playwright’s sample key (`sk_test_4eC39HqLyjWDarjtT1ColDPY`) when `reuseExistingServer` reuses a dev server without your secrets.

### Running All Tests

```bash
# Run the server integration config used in CI/local triage
npm run test:server

# Or using Jest directly
npx jest --config=jest.integration.config.cjs
```

### Running Specific Test Suites

```bash
# Run Phase 1 tests only
npm run test:server -- --testPathPatterns=phase1

# Run specific test file
npm run test:server -- --testPathPatterns=phase1/user-management

# Run tests matching a pattern
npm run test:server -- --testNamePattern="Multi-Role"
```

### Conditional suites

Most suites run without a live DB via the test harness. **`phase2/multi-role-management`** talks to PostgreSQL (`getDb()` / Drizzle). It runs **only when** `TEST_DATABASE_URL` is set; otherwise Jest shows **1 skipped** suite on a full `npm run test:server` run.

```bash
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/asa_test" npm run test:server -- --testPathPatterns=phase2/multi-role-management
```

Feature-flag example:

```bash
RUN_CART_QUERY_CACHE_TESTS=true npm run test:server -- --testPathPatterns=phase3/cart-query-cache
```

### Running with Coverage

```bash
# Generate coverage report
npm run test:integration -- --coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

### Watch Mode (Development)

```bash
# Run tests in watch mode
npm run test:integration -- --watch

# Run specific file in watch mode
npm run test:integration -- --watch server/tests/integration/phase1/class-management.test.ts
```

## Phase 1 Implementation Status

### ✅ Completed Test Files

1. **User Management** (`user-management.test.ts`)
   - User account creation (all roles)
   - Multi-role user handling
   - Role selection and switching
   - Dashboard routing
   - Profile editing
   - Authentication flows

2. **Class Management** (`class-management.test.ts`)
   - Class CRUD operations
   - Pricing and variants
   - Filtering and sorting
   - Enrollment counts
   - Class sharing
   - Multi-location support

3. **Staff Management** (`staff-management.test.ts`)
   - Staff profile management
   - Email invitations
   - Class assignments
   - Multi-location assignments
   - Permission management
   - Position customization

4. **Student Management** (`student-management.test.ts`)
   - Student profile CRUD
   - Emergency contacts
   - Medical information
   - Enrollment management
   - Student rosters
   - Multi-child families

5. **Notifications** (`notifications.test.ts`)
   - Individual notifications
   - Role-based notifications
   - Location-based notifications
   - Broadcast notifications
   - Delivery methods (in-app, email, SMS)
   - Real-time WebSocket delivery
   - Notification center operations

6. **Parent Profile Management** (`parent-profile-management.test.ts`)
   - School admin viewing parent profiles
   - Parent self-service operations
   - Multi-tenant security and data isolation
   - Data integrity (payment calculations, balances)
   - Enrollment status tracking
   - Emergency contact information
   - Performance testing with multiple children/enrollments

### Test Coverage

- **Total Tests in Phase 1**: 97+ scenarios
- **Test Files Created**: 6
- **Features Covered**: 95%+ of Phase 1 requirements

## Writing New Tests

### Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks } from '../../helpers/mockServices';

describe('Integration: Feature Name', () => {
  let testData: any;

  beforeAll(async () => {
    await testDb.cleanup();
    // Setup test environment
    const env = await testDb.setupTestEnvironment();
    testData = env;
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('should perform expected behavior', async () => {
    // Arrange
    const data = { /* test data */ };

    // Act
    const response = await api.post('/api/endpoint', data);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('expectedField');
  });
});
```

### Using Test Helpers

#### Database Helpers

```typescript
// Create test user
const user = await testDb.createTestUser({
  email: 'test@example.com',
  role: 'parent'
});

// Create test school
const school = await testDb.createTestSchool(adminId, {
  name: 'Test School'
});

// Create complete environment
const env = await testDb.setupTestEnvironment();
// Returns: { admin, school, locations, categories, parent, children, educator }
```

#### API Helpers

```typescript
// Login as user
await api.loginAsUser(user.email);

// Make API calls
const response = await api.get('/api/endpoint');
const response = await api.post('/api/endpoint', data);

// Assert responses
api.expectSuccess(response);
api.expectError(response, 400);
api.expectUnauthorized(response);
```

#### Mock Services

```typescript
import { mockStripeService, mockBrevoService } from '../../helpers/mockServices';

// Verify mock was called
expect(mockStripeService.paymentIntents.create).toHaveBeenCalled();
expect(mockBrevoService.sendTransacEmail).toHaveBeenCalledWith(
  expect.objectContaining({ to: [{ email: 'test@example.com' }] })
);
```

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Use `beforeEach` to reset mocks
- Use `beforeAll`/`afterAll` for expensive setup/cleanup
- Clean up database after tests

### 2. Descriptive Names

```typescript
// Good
it('should prevent enrollment when class is full')

// Bad
it('test enrollment')
```

### 3. Arrange-Act-Assert Pattern

```typescript
it('should create user', async () => {
  // Arrange: Set up test data
  const userData = { email: 'test@example.com' };

  // Act: Perform the action
  const user = await testDb.createTestUser(userData);

  // Assert: Verify the result
  expect(user.email).toBe('test@example.com');
});
```

### 4. Test Edge Cases

- Empty inputs
- Invalid data
- Boundary conditions
- Permission checks
- Race conditions

### 5. Use Meaningful Assertions

```typescript
// Good
expect(response.body.users).toHaveLength(5);
expect(response.body.user.role).toBe('parent');

// Less helpful
expect(response.body).toBeDefined();
```

## Troubleshooting

### Tests Failing Due to Database

1. **Database not running**: Ensure PostgreSQL is running
   ```bash
   pg_isready
   ```

2. **Connection issues**: Check `TEST_DATABASE_URL` environment variable

3. **Schema outdated**: Run migrations on test database
   ```bash
   npm run db:push
   ```

### Tests Timing Out

1. Increase timeout in `jest.config.js` or individual test:
   ```typescript
   jest.setTimeout(60000); // 60 seconds
   ```

2. Check for unclosed database connections

### Mock Services Not Working

1. Ensure `resetAllMocks()` is called in `beforeEach`
2. Verify mock configuration in `mockServices.ts`
3. Check that imports are correct

## CI/CD Integration

Tests are automatically run in CI on every push to `main` and every pull
request via `.github/workflows/tests.yml`. The single `tests` job boots the
dev server, then runs the full `npm test` script (server integration suite +
client jsdom suite). The earlier `integration-tests.yml` workflow has been
removed — `tests.yml` is now the canonical entry point.

## Payment-Flow Regression Harness

The `server/tests/integration/payment-flow/` suite is a **black-box regression
harness** for the cart → PaymentIntent → webhook → enrollment flow. Unlike the
phase suites above, these tests do NOT spin up an in-process Express server.
They drive the real dev server (`npm run dev`, port 5000) over HTTP and use a
real Stripe test client to create + confirm PaymentIntents.

### Layout

```
server/tests/integration/payment-flow/
├── helpers/
│   ├── signWebhook.ts            # HMAC-SHA256 sign Stripe payloads (t=...,v1=...)
│   ├── stripeTestClient.ts       # Memoized Stripe client (sk_test_ only)
│   ├── confirmPaymentIntent.ts   # Create + confirm PI with pm_card_visa
│   └── seedCartScenario.ts       # POST /api/test/setup-cart-scenario wrapper
└── cart-pi-success.test.ts       # Worked example: regression gate for finding #1
```

### Required env

| Variable                       | Purpose                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Postgres connection (must have app schema applied via `npm run db:push`).  |
| `STRIPE_WEBHOOK_SECRET`        | Used by both the dev server and `signWebhook` — values must match.         |
| `STRIPE_TEST_SECRET_KEY`       | Stripe test-mode secret (task-spec name). Bridged to `TESTING_STRIPE_SECRET_KEY` automatically. |
| `TESTING_STRIPE_SECRET_KEY`    | Codebase-native alias (`server/config/stripe.ts` reads this). Either name works. |
| `PAYMENT_PROCESSOR_ENABLED`    | Must be `true`; `server/tests/setup.ts` throws otherwise.                  |
| `STRIPE_WEBHOOK_DEV_BYPASS`    | Should be `false` so signature verification is actually exercised.         |
| `TEST_BASE_URL`                | Optional; defaults to `http://localhost:5000`.                             |

### Running locally

```bash
# Terminal 1
npm run dev

# Terminal 2 (after the server is listening on :5000)
npm run test:server          # full server integration suite (incl. payment-flow)
npm run test:client          # client jsdom unit tests
npm test                     # both suites in series
```

### What `cart-pi-success.test.ts` proves

1. `/api/test/setup-cart-scenario` actually persists a `program_enrollment`
   row to Postgres (regression gate for finding #1 — the silent MemStorage
   fallback when `child_name` was NULL).
2. The real cart endpoints accept a session-cookie-authenticated request
   end-to-end:
   `/api/test/login` → `/api/cart/snapshot` → `/api/stripe/create-payment-intent`
   → server-side `paymentIntents.confirm(pm_card_visa)` → signed
   `payment_intent.succeeded` POST to `/api/stripe/webhook`.
3. After the webhook returns 200, the program_enrollment row in Postgres is
   updated to `status: 'enrolled'`, `remainingBalance: 0`, and a
   `stripe_payment_history` row exists for the PaymentIntent ID.

The suite runs as part of the standard `npm test` step in CI; failures
block the build the same way the rest of the suite does.

## Next Steps

### Upcoming Phases

- **Phase 2**: Financial & Enrollment (36 tests)
- **Phase 3**: AI-Powered Features (32 tests)
- **Phase 4**: Custom Forms (24 tests)
- **Phase 5-14**: Additional features (181 tests)

### Contributing

When adding new tests:

1. Follow the existing test structure
2. Add tests to appropriate phase directory
3. Update this README with new test coverage
4. Ensure all tests pass before committing
5. Maintain >80% code coverage

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [Integration Testing Plan](../../../INTEGRATION_TESTING_PLAN.md)
