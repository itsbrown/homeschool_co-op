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

**Enrollment financial fields** (all in cents): `totalCost`, `totalPaid`, `remainingBalance` — these are the single source of truth for payment display.

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

## Common Pitfalls

- **Express route ordering**: Specific named routes (e.g., `/classes/assignments`) BEFORE parameterized routes (e.g., `/classes/:id`)
- **Orphaned data**: `scheduled_payments` with deleted `program_enrollments` must be filtered out of admin views
- **Auth ID mapping**: Use `authData.dbUserId` (integer) NOT `authData.userId` (Supabase UUID) when querying database tables
- **TanStack Query**: Use the default fetcher (no custom `queryFn`), use `apiRequest` for mutations, always invalidate cache by queryKey after mutations
