---
name: asa-auth-patterns
description: Authentication, authorization, multi-role system, API request patterns, and multi-tenant security for the ASA Learning Platform. Use when working with login flows, protected routes, role-based access, API calls from frontend, or debugging 401/403 errors.
---

# ASA Authentication & Authorization

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
Users must register through proper channels (school registration link) before using OAuth login. Unregistered users get a `403 REGISTRATION_REQUIRED` response.

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

### Checking Permissions (Backend)
Always check BOTH sources:
```typescript
const userRoles = await storage.getUserRolesByUserId(userId);
```
This returns all roles from the `user_roles` table. For legacy users who only have `users.role`, the middleware also checks that field.

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

## Common Auth Debugging

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 401 error | Bare `fetch()` used without auth headers | Use `useQuery` or `apiRequest` |
| 401 "No token provided" on file upload | Used bare `fetch()` with `FormData` — missing `Authorization` header | Use `apiRequest('POST', url, formData)` which auto-attaches the token, or manually get the token via `supabase.auth.getSession()` and add `Authorization: Bearer ${token}` header |
| 401 error | Token expired, refresh failed | Check Supabase session, user may need to re-login |
| 403 error | Role doesn't have permission | Check `user_roles` table for correct role at correct school |
| 403 `REGISTRATION_REQUIRED` | Unregistered user tried OAuth | User needs school registration link first |
| "User not found" | Used Supabase UUID instead of DB integer ID | Use `authData.dbUserId` not `authData.userId` |
| Role switcher not showing | Only one role at current school | Check `user_roles` entries for that school |
| Wrong data returned | School context mismatch | Verify `schoolId` on user's active role matches expected school |

## Best Practices

### Do
- Always use `apiRequest` or the default TanStack Query fetcher for authenticated API calls — never bare `fetch()`
- Always use `authData.dbUserId` (integer) for database queries, not `authData.userId` (Supabase UUID)
- Always check the `user_roles` table as the source of truth for roles — `users.role` is a legacy fallback only
- Always validate school membership on the backend before returning school-scoped data
- Always use `useRole()` for access control checks and `useAuth()` for user identity
- Always pass `user_roles.id` (not role name string) to `setActiveRole()`
- Always invalidate relevant TanStack Query caches after role switches
- Always handle 401 token expiration gracefully — `apiRequest` retries once after refresh

### Don't
- Don't trust Supabase `user_metadata` for role or school — database is the source of truth
- Don't use `queryFn` in `useQuery` calls — the default fetcher handles auth automatically
- Don't hardcode role checks against `users.role` — use `user_roles` table lookups
- Don't allow cross-school role switching — filter available roles by current school context
- Don't store sensitive data in Supabase `user_metadata` — it can be modified by users
- Don't forget to include `X-Active-Role` header — `apiRequest` does this automatically, bare `fetch()` does not
- Don't use bare `fetch()` for file uploads to authenticated endpoints — use `apiRequest('POST', url, formData)` which handles `FormData`, auth token, and role header automatically
- Don't redirect to login on every 401 — allow one token refresh retry first

### Multi-Tenant Security Checklist
- Backend routes validate `schoolId` from auth context before returning data
- Role checks use `user_roles` table, not client-provided role claims
- Educator endpoints verify class assignment before exposing student data
- School admin endpoints restrict to their own school's data
- Super admin endpoints have explicit role checks (not just "any authenticated user")

## Key Files
- `server/middleware/supabase-auth.ts` — auth middleware, ID mapping, metadata sync
- `client/src/lib/queryClient.ts` — `apiRequest`, default fetcher, token refresh
- `client/src/components/SupabaseProvider.tsx` — `useAuth()` hook
- `client/src/contexts/RoleContext.tsx` — `useRole()` hook, role switching
- `client/src/components/RoleSwitcher.tsx` — role switching UI component
- `server/storage.ts` — `getUserRolesByUserId()`, `getUserByEmail()`
