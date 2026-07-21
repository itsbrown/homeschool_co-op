---
name: asa-auth-patterns
description: Authentication, authorization, multi-role system, API request patterns, and multi-tenant security for the ASA Learning Platform. Use when working with login flows, protected routes, role-based access, API calls from frontend, or debugging 401/403 errors.
---

# ASA Authentication & Authorization

## Core Rules

- **Use DB integer ID for all queries**: `req.user.id` and `authData.dbUserId` are the integer DB IDs — never use `authData.userId` (Supabase UUID) for database lookups
- **DB is the source of truth**: Role and school_id come from the database, not from Supabase `user_metadata` or `app_metadata`
- **Never use bare `fetch()`**: Always use `apiRequest` or the default TanStack Query fetcher — they attach auth headers, role headers, and handle token refresh automatically
- **403 REGISTRATION_REQUIRED is ambiguous**: This code fires both for unregistered users AND for DB connectivity failures — do not treat it as an exclusive signal that the user is unregistered
- **Distinguish DB errors from not-found**: A thrown DB exception means the DB is unreachable; a `null` return means user not found — return `503` for DB errors, `403` only for confirmed not-found

## Supabase Auth Flow

Supabase handles all authentication (login, signup, password reset, OAuth/Google). The backend middleware maps Supabase identity to the application's database user.

### The ID Mapping (Critical)
```
Supabase UUID (string) → req.user.sub
Database integer ID   → req.user.id (also req.auth.dbUserId)
```
- **`req.user.id`** = integer database ID — use this for ALL database queries
- **`req.user.sub`** = Supabase UUID string — only used for Supabase API calls
- **`req.auth.dbUserId`** = same integer ID, available on `req.auth` — use this in route handlers accessing `(req as any).auth`

**#1 mistake**: Using `authData.userId` (Supabase UUID) instead of `authData.dbUserId` (integer) when querying database tables. This causes "user not found" errors.

### Middleware Chain
```
Request → supabaseAuth middleware → route handler
```
1. `supabaseAuth` extracts Bearer token from `Authorization` header
2. Validates token with Supabase (`supabase.auth.getUser(token)`)
3. Looks up user in database by email (`storage.getUserByEmail`)
4. Sets `req.user` with database integer ID and `req.auth` with full context
5. Database is **always** the source of truth for role and school_id (not Supabase metadata)

### Unregistered User Protection
Users must register through proper channels (school registration link) before using OAuth login. Unregistered users get a `403 REGISTRATION_REQUIRED` response. **This 403 also fires incorrectly when the DB lookup throws** (e.g. DB timeout at startup) — `dbUserId` remains `null` in both the "user not found" and "DB unreachable" cases. A `403 REGISTRATION_REQUIRED` is therefore not an exclusive signal that the user is unregistered; it can also indicate a database connectivity failure.

## API Request Patterns (Frontend)

### NEVER use bare `fetch()` for authenticated endpoints

The default TanStack Query fetcher and `apiRequest` automatically:
- Attach the Supabase session token (`Authorization: Bearer ...`)
- Include the active role header (`X-Active-Role`)
- Handle 401 token refresh automatically
- Handle 403 `REGISTRATION_REQUIRED` redirects
- Track API errors in the error monitoring system

### GET Requests — Use TanStack Query
```typescript
const { data, isLoading } = useQuery<ResponseType>({
  queryKey: ['/api/educator/classes'],
});
```
- Do NOT define a custom `queryFn` — the default fetcher is already configured
- For hierarchical keys: `queryKey: ['/api/classes', id]` (array segments for cache invalidation)
- Do NOT use template literals in queryKey: `['/api/classes', id]` not `` [`/api/classes/${id}`] ``

### POST/PATCH/DELETE — Use `apiRequest`
```typescript
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

const mutation = useMutation({
  mutationFn: (data) => apiRequest('POST', '/api/endpoint', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/endpoint'] });
  },
});
```
- Always invalidate cache by queryKey after mutations
- `apiRequest` handles FormData uploads (detects `instanceof FormData`, omits `Content-Type` header)
- For file uploads: pass `FormData` directly as the body

### Token Refresh Flow
```
API call → 401 response → refreshToken() → retry once → success or redirect to /login
```
- Automatic: `apiRequest` handles 401 with one retry after token refresh
- Prevents infinite loops: only retries once (`_retryCount` parameter)
- On refresh failure: clears `supabase_token` from localStorage, redirects to `/login`

## Multi-Role System

### Data Model
```
users.role          → legacy single role field (still used as fallback)
user_roles table    → multi-role entries (source of truth)
  .userId           → users.id
  .role             → role name string
  .schoolId         → school this role belongs to
  .isPrimary        → boolean flag for primary role
users.activeRole    → currently selected role name
users.activeRoleId  → ID from user_roles table for current selection
```

### Admin directory labels (Users page)
For **school admin user directory and notifications**, treat `user_roles` rows at the current school as **additive labels** (a user can be `parent` + `educator` + custom positions). Do not default unknown roles to `parent` in list APIs.

- List API: `GET /api/school-admin/users` returns `labels: string[]` and `primaryLabel`
- Profile URL: `/schools/users/:userId` (canonical `users.id`)
- Notifications: resolve recipients with `user_roles` at `schoolId`, not `users.role` alone
- `users.activeRole` / `activeRoleId` = what the **logged-in user** is doing in the app; labels = what an **admin** sees on someone else's account

### Checking Permissions (Backend)
Route handlers should use `req.user.allRoles` (populated by `supabaseAuth` from the `user_roles` table) rather than calling `storage.getUserRolesByUserId()` directly. This avoids an extra DB round-trip on every request.

```typescript
// PREFERRED: use allRoles already populated by supabaseAuth
const roleStrings: string[] = req.user.allRoles ?? [];
```

`req.user.allRoles` is already school-filtered — it includes roles scoped to the user's current/active school and global roles (null schoolId, e.g. superAdmin). For single-school users this is identical to querying `user_roles` directly; for multi-school users it correctly scopes permissions to the active school context.

Only fall back to `storage.getUserRolesByUserId()` when `allRoles` is unexpectedly empty (e.g. middleware order issue or legacy user with no `user_roles` entries), and log a `console.warn` in that case.

### Role Verification Middleware
- `requireEducatorRole` — checks if user has any educator-type role (educator, mentor, teacher, instructor, schoolAdmin, admin, superAdmin)
- `requireSchoolContext` — ensures user has a `schoolId` in their auth context

### Educator Endpoint Access Pattern
Educator endpoints verify class assignment before returning data:
```typescript
const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
const isAssigned = assignments.some(a => a.classId === classId);

if (!isAssigned) {
  // Fallback: check if educator is the instructor
  const classInfo = await storage.getClassById(classId);
  const isInstructor = classInfo?.instructorId === userId;
}
```

### Frontend Role State
- **`useAuth()`** from `SupabaseProvider` — returns the Supabase user object, session state, login/logout functions
- **`useRole()`** from `RoleContext` — returns `activeRole`, `activeRoleId`, `availableRoles`, `canSwitchRoles`, `setActiveRole`
- Use `useRole()` for access control decisions, `useAuth()` for user identity

### Role Switching
- `setActiveRole(roleId: number)` — takes a `user_roles.id`, not a role name string
- Switching is restricted to same-school roles (cross-school switching blocked in RoleSwitcher component)
- Active role stored in `localStorage` as `activeRole` and sent via `X-Active-Role` header

## Role Types
| Role | Access Level |
|------|-------------|
| `parent` | Own children, enrollments, payments |
| `educator` / `mentor` / `teacher` | Assigned classes, students, sessions, attendance |
| `schoolAdmin` | School-wide management, all classes, staff, billing |
| `admin` | Platform administration |
| `superAdmin` | Full system access, cross-school |

## Multi-Tenant Security

### School Isolation Rules
- Users only see data from schools they belong to
- Backend endpoints must validate school membership before returning data
- Role switching filtered to same-school roles only
- `requireSchoolContext` middleware enforces school ID presence

### Metadata Security
- Database is the **single source of truth** for role and school_id
- Supabase `user_metadata` can be tampered with by users — never trust it directly
- Phase 2 uses `app_metadata` (admin-only, immutable by users) with auto-sync from database
- Middleware auto-corrects metadata mismatches on every request

## Common Pitfalls

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 401 error | Bare `fetch()` used without auth headers | Use `useQuery` or `apiRequest` |
| 401 "No token provided" on file upload | Used bare `fetch()` with `FormData` — missing `Authorization` header | Use `apiRequest('POST', url, formData)` which auto-attaches the token, or manually get the token via `supabase.auth.getSession()` and add `Authorization: Bearer ${token}` header |
| 401 error | Token expired, refresh failed | Check Supabase session, user may need to re-login |
| 403 error | Role doesn't have permission | Check `user_roles` table for correct role at correct school |
| 403 `REGISTRATION_REQUIRED` | Unregistered user tried OAuth | User needs school registration link first |
| 403 `REGISTRATION_REQUIRED` (DB unavailable) | `getDb()` threw during `getUserByEmail` — DB timeout, not a missing user | Check DB connectivity; distinguish from unregistered-user case by checking server logs for DB errors |
| 403 on school admin routes even with correct role | `requireAdmin` used — allows `'school-admin'` (hyphen) not `'schoolAdmin'` (camelCase) | Replace `requireAdmin` with `requireRole(['schoolAdmin', 'admin', 'superAdmin'])` |
| 400 "Missing context" on write endpoints | `req.userId` used — never set by any middleware | Replace `req.userId` with `req.user?.id` |
| "User not found" | Used Supabase UUID instead of DB integer ID | Use `authData.dbUserId` not `authData.userId` |
| Role switcher not showing | Only one role at current school | Check `user_roles` entries for that school |
| Wrong data returned | School context mismatch | Verify `schoolId` on user's active role matches expected school |

## Best Practices

### Do
- Always use `apiRequest` or the default TanStack Query fetcher for authenticated API calls — never bare `fetch()`
- Always use `authData.dbUserId` (integer) for database queries, not `authData.userId` (Supabase UUID)
- In route handlers, use `req.user?.id` for the database integer user ID — `supabaseAuth` sets this on every request
- Test new features as a real school admin (not superAdmin) — superAdmins bypass role checks and mask authorization bugs
- Always check the `user_roles` table as the source of truth for roles — `users.role` is a legacy fallback only
- Always validate school membership on the backend before returning school-scoped data
- Always use `useRole()` for access control checks and `useAuth()` for user identity
- Always pass `user_roles.id` (not role name string) to `setActiveRole()`
- Always invalidate relevant TanStack Query caches after role switches
- Always handle 401 token expiration gracefully — `apiRequest` retries once after refresh

### Shell Wrappers Must Branch on `activeRole`, Never `hasRole`

Shell wrappers in `App.tsx` that select which sidebar to render **must** branch on `activeRole` (the role the user is currently acting as), **never** on `hasRole(...)` (which checks role membership, not the currently active role).

**Why:** `hasRole('parent')` returns `true` for any user who holds the parent role — even if their active role is `schoolAdmin`. This causes multi-role users to always get wrapped in `ParentAppShell`, which sets `hasShell = true` in `LayoutShellContext`, and causes `SchoolAdminLayout` to skip rendering `UnifiedSchoolAdminSidebar`.

**Wrong (role membership check — broken for multi-role users):**
```typescript
function SchoolAdminShellWrapper({ children }: { children: React.ReactNode }) {
  const { hasRole } = useRole();
  if (hasRole('parent')) {           // BUG: true even when actively acting as schoolAdmin
    return <ParentAppShell>{children}</ParentAppShell>;
  }
  return <>{children}</>;
}
```

**Correct (active role check):**
```typescript
function SchoolAdminShellWrapper({ children }: { children: React.ReactNode }) {
  const { activeRole } = useRole();
  if (activeRole === 'parent') {     // Only wraps when user is currently acting as parent
    return <ParentAppShell>{children}</ParentAppShell>;
  }
  return <>{children}</>;
}
```

Apply the same rule to every shell wrapper (`EducatorShellWrapper`, etc.): always compare against `activeRole`, not `hasRole(...)`.

### Effective permissions (nav + API)

Canonical registry: `shared/permissions.ts`. Client: `useEffectivePermissions` / `useCan` → `GET /api/me/effective-permissions`.

| Concept | Rule |
|---------|------|
| Nav + route guards | Driven by **activeRole** + OR of active `user_locations` flags; school-wide via `user_school_permissions` (`canAccessEntireSchool`) |
| Bypass roles | `schoolAdmin`, `director`, `admin`, `superAdmin` when that role is **active** |
| API | `attachAccessScope` + `requirePermission` / `requireLocationInScope`; list handlers filter with `locationFilterIds` |
| Enforcement | Env `PERMISSIONS_ENFORCEMENT`: `off` \| `observe` (default) \| `enforce` |
| Fail closed | Missing grants → hide nav / 403 in enforce; never invent access from legacy JSONB alone |
| Unlisted deep links | Paths not in `NAV_REGISTRY` require school-wide / bypass — one unrelated location flag must not open them |
| Client cache | `useEffectivePermissions` query key includes `activeRole`; role switch invalidates `/api/me/effective-permissions` |
| X-Active-Role | Honor only when held in `user_roles` / legacy roles (`resolveTrustedActiveRole`); never trust spoofed bypass roles |
| Guard mount | `SchoolRouteGuard` wraps the app `Switch` so both `/schools/*` and `/school-admin/*` are gated |
| Parent bypass | Only `/school-admin/*` while `activeRole === 'parent'` (ParentAppShell silent switch); `/schools/*` stays gated |
| Class list OR | `GET /api/school-admin/classes` via `requireAnyPermission(canManageClasses, canSendNotifications)` |
| Null `locationId` lists | Location-scoped class/student lists keep rows with `locationId == null` (school-wide) |
| Legacy JSONB | `users.permissions.canCreateClasses` — use `legacyCanCreateClassesAllowed`; explicit false denies only when no location grant; JSONB `true` is **not** authorization |
| Legacy `Sidebar.tsx` | Out of scope — prefer UnifiedSchoolAdminSidebar / Parent* / EducatorAppShell |

Staff Permissions UI writes location + school-wide rows; those unlock matching sidebar groups (see `NAV_GROUP_PERMISSIONS`).

### Don't
- Don't use `req.userId` in route handlers — it is never set by any middleware. Use `req.user?.id` (the integer DB ID set by `supabaseAuth`) instead
- Don't use `requireAdmin` from `auth0-auth.ts` for school admin routes — it allows `'school-admin'` (hyphen) which does NOT match the DB role `'schoolAdmin'` (camelCase). Use `requireRole(['schoolAdmin', 'admin', 'superAdmin'])` directly
- Don't trust Supabase `user_metadata` for role or school — database is the source of truth
- Don't use `queryFn` in `useQuery` calls — the default fetcher handles auth automatically
- Don't hardcode role checks against `users.role` — use `user_roles` table lookups
- Don't allow cross-school role switching — filter available roles by current school context
- Don't store sensitive data in Supabase `user_metadata` — it can be modified by users
- Don't forget to include `X-Active-Role` header — `apiRequest` does this automatically, bare `fetch()` does not
- Don't use bare `fetch()` for file uploads to authenticated endpoints — use `apiRequest('POST', url, formData)` which handles `FormData`, auth token, and role header automatically
- Don't redirect to login on every 401 — allow one token refresh retry first
- Don't treat a thrown DB exception (`dbLookupFailed`) the same as a `null` return (user not found) — use separate flags and return `503` for DB errors, `403` only for a confirmed not-found user
- Don't gate school-admin nav with `hasRole` while the user is acting as parent — use `activeRole` + effective permissions
- Don't use `db:push` for permissions schema — apply `server/migrations/permissions-scoping.sql` only

### Multi-Tenant Security Checklist
- Backend routes validate `schoolId` from auth context before returning data
- Role checks use `user_roles` table, not client-provided role claims
- Educator endpoints verify class assignment before exposing student data
- School admin endpoints restrict to their own school's data
- Super admin endpoints have explicit role checks (not just "any authenticated user")
- Location-scoped staff lists (students/classes/staff) honor `accessibleLocationIds` unless school-wide grant

## Key Files
- `server/middleware/supabase-auth.ts` — auth middleware, ID mapping, metadata sync
- `shared/permissions.ts` — permission registry, aggregation, nav map
- `server/middleware/access-scope.ts` — `attachAccessScope`, `requirePermission`, `locationFilterIds`
- `server/api/me.ts` — `GET /api/me/effective-permissions`
- `client/src/hooks/useEffectivePermissions.ts` — client nav/guards
- `client/src/components/auth/SchoolRouteGuard.tsx` — path permission guard
- `client/src/lib/queryClient.ts` — `apiRequest`, default fetcher, token refresh
- `client/src/components/SupabaseProvider.tsx` — `useAuth()` hook
- `client/src/contexts/RoleContext.tsx` — `useRole()` hook, role switching
- `client/src/components/RoleSwitcher.tsx` — role switching UI component
- `server/storage.ts` — `getUserRolesByUserId()`, `getUserByEmail()`
- `docs/PERMISSIONS_ROLLOUT.md` — rollout / Replit apply steps