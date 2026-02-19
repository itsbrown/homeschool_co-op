---
name: asa-sql-patterns
description: SQL query construction, column name verification, and raw SQL safety patterns for the ASA Learning Platform. Use when writing any SQL query (for tools, manual execution, or providing to the user), debugging database issues, or constructing raw SQL in code.
---

# ASA SQL Patterns

## Core Rules

- **Always verify columns before writing SQL**: Before constructing ANY SQL query, read the relevant table definition in `shared/schema.ts` to confirm exact column names. Never guess or assume column names from memory.
- **Column naming is snake_case in SQL**: Drizzle schema uses camelCase (`creditAmountCents`), but raw SQL must use snake_case (`credit_amount_cents`). Always translate.
- **Financial column naming varies by table**: Some tables use `_cents` suffix (e.g., `credit_amount_cents`, `used_amount_cents`) while others use plain names (e.g., `total_cost`, `total_paid`). Always check the specific table schema — never assume the naming pattern.
- **Use ILIKE for name searches**: When filtering by user names, always use `ILIKE` with wildcards for flexible matching (e.g., `first_name ILIKE 'leigh%'`).

## Pre-Query Verification Workflow

Every time you need to write a SQL query:

1. **Identify the tables** involved in the query
2. **Read `shared/schema.ts`** — search for the table definition using grep: `grep -A 30 'tableName.*=.*pgTable' shared/schema.ts`
3. **Note the exact column names** from the Drizzle schema and translate to snake_case
4. **Write the query** using verified column names
5. **Double-check JOINs** — confirm foreign key column names from the schema

### Example Verification

Before writing a credits query:
```
# Step 1: Check the credits table schema
grep -A 25 'credits.*=.*pgTable' shared/schema.ts

# Step 2: Find actual columns (camelCase → snake_case)
# creditAmountCents → credit_amount_cents
# usedAmountCents → used_amount_cents
# creditType → credit_type
# userId → user_id

# Step 3: Write correct SQL
SELECT c.id, c.credit_type, c.credit_amount_cents, c.used_amount_cents, c.status
FROM credits c
JOIN users u ON c.user_id = u.id
WHERE u.first_name ILIKE 'leigh%';
```

## Common Column Name Translations

| Drizzle (camelCase) | SQL (snake_case) | Notes |
|---|---|---|
| `userId` | `user_id` | FK to users.id |
| `schoolId` | `school_id` | FK to schools.id |
| `childId` | `child_id` | FK to children.id |
| `createdAt` | `created_at` | Timestamp |
| `updatedAt` | `updated_at` | Timestamp |
| `creditAmountCents` | `credit_amount_cents` | Money in cents (credits table) |
| `usedAmountCents` | `used_amount_cents` | Money in cents (credits table) |
| `totalCost` | `total_cost` | Money in cents (enrollments) |
| `totalPaid` | `total_paid` | Money in cents (enrollments) |
| `remainingBalance` | `remaining_balance` | Money in cents, nullable (enrollments) |
| `firstName` | `first_name` | User name |
| `lastName` | `last_name` | User name |
| `parentEmail` | `parent_email` | Denormalized email |
| `marketplaceClassId` | `marketplace_class_id` | FK to classes.id |
| `creditType` | `credit_type` | Enum column |
| `sourceType` | `source_type` | Polymorphic source |
| `sourceId` | `source_id` | Polymorphic FK |
| `approvedBy` | `approved_by` | FK to users.id |
| `approvedAt` | `approved_at` | Timestamp |
| `staffId` | `staff_id` | FK or identifier |

**Important**: This table is a convenience reference, NOT a substitute for checking `shared/schema.ts`. Always verify against the actual schema.

## Common Pitfalls

- **`amount` column not found** — Guessed column name instead of checking schema. Fix: always grep the table definition in `shared/schema.ts` first; credits uses `credit_amount_cents`.
- **Query returns zero rows unexpectedly** — Used `=` with exact casing for name match. Fix: use `ILIKE` with `%` wildcards (e.g., `first_name ILIKE 'leigh%'`).
- **Wrong JOIN producing duplicates or empty results** — Used wrong FK column name. Fix: verify FK columns from schema before writing JOINs (e.g., `c.user_id = u.id`, not `c.parent_id`).
- **NULL balance breaks calculations** — Assumed `remaining_balance` is always populated. Fix: use `COALESCE(remaining_balance, total_cost - total_paid)`.
- **camelCase in raw SQL fails silently** — PostgreSQL folds unquoted identifiers to lowercase, causing mismatches. Fix: always translate Drizzle camelCase to snake_case for raw SQL.

## Best Practices

### Do
- Read `shared/schema.ts` before every SQL query to verify column names
- Use snake_case for all column names in raw SQL
- Use `ILIKE` with `%` wildcards for user name lookups
- Include `ORDER BY` for readable results (usually `created_at DESC`)
- Use `COALESCE` for nullable financial fields like `remaining_balance`
- Translate Drizzle camelCase to SQL snake_case (e.g., `creditType` → `credit_type`)
- Test queries with `LIMIT` first when exploring unfamiliar tables

### Don't
- Never guess column names from memory — always verify against `shared/schema.ts`
- Never assume a column exists without checking the schema first
- Never write raw SQL in application code without using Drizzle's parameterized queries
- Never use camelCase column names in raw SQL queries
- Never assume financial column naming patterns — check each table individually
- Never skip the verification step even for "simple" queries
- Never provide SQL to the user without first confirming column names

## Key Files

- `shared/schema.ts` — Single source of truth for all table definitions and column names
- `server/storage.ts` — Storage interface with Drizzle query patterns for CRUD operations
- `server/db/index.ts` — Database connection and Drizzle client initialization
- `drizzle.config.ts` — Database connection configuration and migration settings
- `server/api/parent.ts` — Parent-facing API with complex SQL joins (credits, enrollments)
- `server/api/school-admin.ts` — School admin API with multi-table queries and aggregations
- `server/api/admin-enrollments.ts` — Enrollment queries with financial field lookups
