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

### Running All Tests

```bash
# Run all integration tests
npm run test:integration

# Or using Jest directly
npx jest --config=jest.config.js
```

### Running Specific Test Suites

```bash
# Run Phase 1 tests only
npm run test:integration -- server/tests/integration/phase1

# Run specific test file
npm run test:integration -- server/tests/integration/phase1/user-management.test.ts

# Run tests matching a pattern
npm run test:integration -- --testNamePattern="Multi-Role"
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
