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
