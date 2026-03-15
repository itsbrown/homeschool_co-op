---
name: asa-database-patterns
description: Database schema conventions, data relationships, storage patterns, and date/schedule handling for the ASA Learning Platform. Use when modifying database schema, writing storage methods, creating API endpoints that query data, or working with dates, schedules, enrollments, and proration calculations.
---

# ASA Database Patterns

## Schema Conventions

- **Column naming**: snake_case in PostgreSQL, camelCase in Drizzle schema (e.g., `parent_id` in DB → `parentId` in code)
- **Insert schemas**: Use `createInsertSchema(table).omit({ id: true, createdAt: true, ... })` to exclude auto-generated fields
- **Array columns**: Call `.array()` as a method on the column type: `text().array()` NOT `array(text())`
- **Financial amounts**: Always stored in **cents** (integer), never dollars. Convert on display: `(amountCents / 100).toFixed(2)`
- **Primary keys**: Never change existing ID column types (serial ↔ varchar). This breaks migrations.

## Key Data Relationships

### Children → Parents → Emergency Contacts
```
children.parentId → users.id (parent)
children.parentEmail → quick lookup field (denormalized)
children.emergencyContact → legacy free-text field

users.phone → parent phone number
users.emergencyContactFirstName/LastName/Phone/Relationship → inline emergency contact on user

emergency_contacts.userId → users.id → separate emergency contacts table (supports multiple)
```

**Emergency contact priority**: User table fields first → `emergency_contacts` table fallback → `children.emergencyContact` legacy fallback.

### Enrollments
```
program_enrollments → marketplace class enrollments (classType = 'marketplace')
  .marketplaceClassId → classes.id
  .childId → children.id
  .parentEmail → denormalized parent email

school_class_enrollments → school-managed class enrollments
  .classId → school_classes.id
```

**Enrollment financial fields** (all in cents): `totalCost`, `totalPaid`, `remainingBalance`, `compAmountCents`, `effectiveBalance`. Note: `remainingBalance` is a stored convenience field that is **unreliable** — it is set to `0` (not NULL) for `deposit_only`/`stripe_managed` enrollments after a deposit and for comped accounts, causing false positives in financial reports. Use `effective_balance` (a PostgreSQL generated column) instead — see "Derived Financial Fields" below.

### Multi-Guardian System
Multiple guardians can be linked to child accounts with shared access. Check guardian relationships when resolving parent data.

## Storage Interface Pattern

- All data access goes through the `IStorage` interface in `server/storage.ts`
- **Never query the database directly from route handlers**
- Routes should be thin: validate input → call storage method → return response

### Adding New Operations
1. Add method signature to `IStorage` interface
2. Implement in the storage class (database-backed with memory fallback)
3. Use the method in route handlers via `storage.methodName()`

### Common Storage Methods
```typescript
storage.getUser(id)                          // Get user by integer ID
storage.getUserByEmail(email)                // Get user by email
storage.getAllChildren()                     // All children records
storage.getAllEnrollments()                  // All program enrollments
storage.getEmergencyContactsByUserId(userId) // Emergency contacts for a parent
storage.getClassById(classId)               // Single class by ID
```

## Date & Schedule Patterns

### Date Storage Types
| Field | Type | Format | Example |
|-------|------|--------|---------|
| `birthdate` | `date` | YYYY-MM-DD | `2018-05-15` |
| `startDate`, `endDate` (classes) | `date` or `timestamp` | varies | `2026-01-05` |
| `scheduledDate` (sessions) | `text` | YYYY-MM-DD | `2026-02-17` |
| `scheduledStartTime`, `scheduledEndTime` | `text` | HH:MM | `09:00` |
| `createdAt`, `updatedAt` | `timestamp` | ISO 8601 | auto-generated |

### Date Display
Use `formatDate()` from `@/lib/utils`:
- Handles ISO date strings (YYYY-MM-DD) by parsing directly without timezone adjustment
- Returns MM/DD/YYYY format
- Handles edge cases for other date formats with timezone offset correction

### Schedule Format (Classes)
Classes use a JSON `schedule` field with a **variants** structure:
```json
{
  "variants": [{
    "name": "Morning Session",
    "startTime": "09:00",
    "endTime": "12:00",
    "days": ["Monday", "Wednesday", "Friday"]
  }]
}
```
Use `formatClassSchedule()` from `@/lib/utils` to display — it parses JSON and formats as human-readable text.

### iOS/Safari Date Handling
- Date inputs must use `style={{ fontSize: '16px' }}` to prevent Safari auto-zoom
- Use CSS `@supports (-webkit-touch-callout: none)` for iOS-specific adjustments
- Stripe payments need `return_url` redirects for iOS compatibility

### Age Calculation
```typescript
Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
```

### Proration Date Math
Located in `server/lib/prorate-calculator.ts`:
- Normalizes all dates to midnight (start) or end-of-day (end)
- `totalDays = ceil((endDate - startDate) / oneDay)`
- `daysRemaining = ceil((endDate - enrollmentDate) / oneDay)`
- `proratedPrice = round(originalPrice * daysRemaining / totalDays)`
- Returns full price if enrollment ≤ start date, zero if enrollment ≥ end date

### QR Token Expiration
Session QR tokens expire at **session end time + 15 minutes**. Atomic database updates with WHERE conditions enforce one-time use.

## Migration Rules

- **Never write raw SQL migrations** — use `npm run db:push`
- If data-loss warning appears, use `npm run db:push --force`
- Never change primary key column types
- Schema file: `shared/schema.ts`

### ⚠️ Project-Specific Exception: db:push Is Blocked in This Environment

`npm run db:push` and `npm run db:push --force` both crash in this project due to a drizzle-kit bug:
- `init-db.ts` created a functional unique index on `user_roles`: `COALESCE(school_id, 0)` as the third index column
- When drizzle-kit reads database indexes, it cannot parse functional expressions — it returns `null` for the expression field, causing a Zod validation crash before any push occurs
- This was confirmed in the development environment; `DATABASE_URL` also points to an unreachable Supabase host, requiring the `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars to be used instead (see `server/lib/database-url.ts`)

**Established workaround**: Add idempotent `ALTER TABLE` statements to `server/init-db.ts`. Every schema change in this project must follow this pattern:
```sql
-- Adding a new column (idempotent):
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS my_column TEXT;

-- Dropping a NOT NULL constraint (idempotent — PostgreSQL no-ops if already nullable):
ALTER TABLE my_table ALTER COLUMN my_column DROP NOT NULL;

-- Converting a column type (wrap in DO $$ BEGIN ... END $$ for safety):
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'my_table' AND column_name = 'my_col' AND data_type = 'text'
  ) THEN
    ALTER TABLE my_table ALTER COLUMN my_col TYPE INTEGER USING my_col::INTEGER;
  END IF;
END $$;
```
Place all such statements inside the relevant migration try-catch block in `server/init-db.ts`, following the existing patterns throughout the file. The app runs these on startup — they are safe to re-run on every restart.

## Derived Financial Fields

### ⚠️ Why `remainingBalance` Is Unreliable
The `remainingBalance` column on `program_enrollments` is a stored convenience field with **two known failure modes**:
1. Set to `0` (not NULL) for `deposit_only`/`stripe_managed` enrollments after a deposit payment — `COALESCE(remaining_balance, ...)` returns `0` even though the true balance is hundreds of dollars
2. Set to `0` for comped accounts — does not account for `comp_amount_cents`, so a fully-comped enrollment appears to owe its full `total_cost`

**Never use `remainingBalance` for financial report aggregations.**

### The `effective_balance` Generated Column (Gold Standard)
`program_enrollments.effective_balance` is a PostgreSQL `GENERATED ALWAYS AS STORED` column:
```sql
effective_balance = total_cost - total_paid - COALESCE(comp_amount_cents, 0)
```
- Computed and stored automatically by the database for every row (existing and future)
- Always correct — no write-path changes needed, no stale values possible
- Added via `server/init-db.ts` (idempotent on every startup)

**Use `effective_balance` in all SQL financial queries:**
```sql
-- Outstanding balance total
SELECT COALESCE(SUM(effective_balance), 0)
FROM program_enrollments
WHERE school_id = $1
  AND status NOT IN ('cancelled', 'waitlist', 'withdrawn', 'failed', 'completed')
  AND effective_balance > 0
```

**In Drizzle ORM** (use raw `sql` — the column is not in the Drizzle schema since it's managed by init-db.ts):
```typescript
const result = await db
  .select({
    totalOutstanding: sql<number>`COALESCE(SUM(effective_balance), 0)::integer`,
  })
  .from(programEnrollments)
  .where(
    and(
      eq(programEnrollments.schoolId, schoolId),
      not(inArray(programEnrollments.status, ['cancelled', 'waitlist', 'withdrawn', 'failed', 'completed'])),
      sql`effective_balance > 0`
    )
  );
```

**In TypeScript** (when looping over Drizzle-typed enrollment rows, `effective_balance` is not in the type — use explicit formula):
```typescript
const amount = enrollment.totalCost - enrollment.totalPaid - (enrollment.compAmountCents ?? 0);
```

**Gold-standard pattern** (used in `parent-profile.ts`): Compute dynamically:
```typescript
const actualRemainingBalance = CurrencyUtils.calculateBalance(totalCost, totalPaid + compAmount);
```

### Financial Report Aggregations — Always Use `program_enrollments`

For outstanding balance totals, active payment plan counts, or any financial summary, query `program_enrollments` directly — **not `scheduled_payments`**. The `scheduled_payments` table is a subset: many enrollments have remaining balances but no scheduled_payment records (legacy enrollments pre-scheduling feature, comped enrollments, plans not yet scheduled).

The authoritative fields are `totalCost`, `totalPaid`, `compAmountCents`, and `effective_balance` on `program_enrollments`.

### Auto-Heal at Read Time

When a report endpoint already fetches enrollment records, it can self-correct stale `scheduled_payments` in the same pass — no separate reconciliation job needed.

```typescript
const validBalances = enrichedBalances.filter(b => {
  const isFullyPaid = b.enrollmentRemainingBalance !== undefined && b.enrollmentRemainingBalance <= 0;
  if (isFullyPaid) {
    storage.updateScheduledPaymentStatus(b.id, 'cancelled').catch(() => {}); // fire-and-forget
    return false;
  }
  return true;
});
```

Rules: check `!== undefined` before comparing (undefined means lookup failed, not that balance is zero); use `.catch(() => {})` so the background write never throws in a read endpoint; filter stale records out of the response immediately so the UI is accurate before the DB write completes. Pattern used in `server/api/financial-reports.ts` outstanding balances endpoint.

## Common Pitfalls

- **`getDb()` called without `await`**: `getDb()` is an async function that returns a `Promise<NodePgDatabase>`. Omitting `await` means `db` is a raw Promise, not the database instance — every subsequent `.select()`, `.insert()`, `.update()`, `.delete()` call throws a `TypeError` that is silently caught as a 500 error. Always write `const db = await getDb();`. Better yet, don't call `getDb()` in route handlers at all — add methods to `IStorage` and use `storage.*` instead (see "Best Practices" below).
- **`remainingBalance` is unreliable for aggregations**: It is `0` (not NULL) for `deposit_only`/`stripe_managed` enrollments after a deposit, and `0` for comped accounts — `COALESCE` won't help. Use `effective_balance` in SQL or `totalCost - totalPaid - (compAmountCents ?? 0)` in TypeScript. See "Derived Financial Fields" above.
- **Outstanding balance undercount in reports**: Querying `SUM(scheduled_payments.amount WHERE status='pending')` misses families with no scheduled_payment records — always use `effective_balance FROM program_enrollments` for financial aggregations.
- **Express route ordering**: Specific named routes (e.g., `/classes/assignments`) BEFORE parameterized routes (e.g., `/classes/:id`)
- **Orphaned data**: `scheduled_payments` with deleted `program_enrollments` must be filtered out of admin views
- **Auth ID mapping**: Use `authData.dbUserId` (integer) NOT `authData.userId` (Supabase UUID) when querying database tables
- **TanStack Query**: Use the default fetcher (no custom `queryFn`), use `apiRequest` for mutations, always invalidate cache by queryKey after mutations

## Best Practices

### Schema & Data Integrity
- Always define nullable fields explicitly with `.default(null)` in insert schemas to avoid insertion errors
- Use `.notNull()` for required fields — don't rely on application-level validation alone
- Keep denormalized fields (like `parentEmail` on enrollments) updated when the source changes
- Add unique constraints for natural keys (e.g., enrollment + date + installment number)
- Never add columns without defaults to tables with existing data — use `.default()` or make nullable

### Storage & Query Patterns
- **Don't** call `getDb()` directly in route handlers — add CRUD methods to `IStorage` in `server/storage.ts`, implement them in `DatabaseStorage` in `server/dbStorage.ts`, wire them through `CombinedStorage`, and call `storage.*` from route handlers
- Always go through the `IStorage` interface — never import `db` directly in route handlers
- When adding a new query, check if a similar storage method already exists before creating a new one
- Use `Promise.all()` for independent lookups (e.g., fetching parent + emergency contacts in parallel)
- Avoid `getAllX()` methods in hot paths — use filtered queries when possible (e.g., `getEnrollmentsByChildId` instead of filtering `getAllEnrollments()`)
- Always handle the "not found" case — return `undefined` from storage, check it in the route

### Date Handling
- Store dates as `date` type (YYYY-MM-DD) for calendar/schedule dates, `timestamp` for event times
- Use `formatDate()` from `@/lib/utils` for display — it handles timezone edge cases
- Never construct dates with `new Date('YYYY-MM-DD')` without accounting for timezone offset — use the direct parsing pattern in `formatDate()`
- For age calculations, use millisecond math with 365.25 divisor, not year subtraction
- Always normalize dates to midnight (`setHours(0,0,0,0)`) before day-based comparisons

### CRITICAL: Postgres `date` Columns Require YYYY-MM-DD Strings
When inserting into Postgres `date` columns (e.g., `startDate`, `endDate` on `classes`), **always pass plain `YYYY-MM-DD` strings — never JavaScript `Date` objects**.

**What goes wrong**: Passing a `Date` object to a Drizzle `date()` column causes the Postgres driver to throw `ERR_INVALID_ARG_TYPE`. If the error is caught silently (e.g., by a try/catch that falls back to in-memory storage), the data appears to save but disappears on page refresh because it never reached the database.

**Safe pattern for parsing external date input** (CSV files, form submissions, API requests):
```typescript
function parseDateToYMD(dateStr: string | undefined | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`;
  const usMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2,'0')}-${usMatch[2].padStart(2,'0')}`;
  return null;
}
```

**Key rules**:
- Parse date strings with regex to extract year/month/day components
- Reassemble as a `YYYY-MM-DD` string directly
- Never use `new Date(userInput)` as an intermediate step — timezone offsets shift the date, and the object type breaks the driver
- Support both `MM/DD/YYYY` (US format from CSV/forms) and `YYYY-MM-DD` (ISO) inputs
- For date arithmetic (e.g., "add 3 months"), operate on the string components numerically — see `addMonthsYMD()` in `server/api/csv-upload.ts`

**Where this pattern is established**: `server/api/csv-upload.ts` (CSV date parsing), `server/api/school-admin.ts` (class creation passes date strings directly from `req.body`).

### Migration Safety
- Always run `npm run db:push` to sync schema — never write raw SQL migrations
- Test schema changes on development before pushing to production
- Never rename columns — add the new column, migrate data, then remove the old one
- Never change column types on primary keys or foreign keys
- When adding a required column to an existing table, provide a `.default()` value

## Key Files
- `shared/schema.ts` — all Drizzle table definitions, insert schemas, and inferred types
- `server/storage.ts` — `IStorage` interface and all storage method implementations
- `server/init-db.ts` — idempotent `ALTER TABLE` migrations run on startup (replaces `db:push`)
- `server/lib/database-url.ts` — resolves correct DB connection string (bypasses Supabase host)
- `server/lib/prorate-calculator.ts` — proration date math
- `server/api/csv-upload.ts` — `parseDateToYMD()` and `addMonthsYMD()` date string helpers
- `server/api/financial-reports.ts` — outstanding balances report with auto-heal pattern
