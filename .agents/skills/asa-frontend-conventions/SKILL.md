---
name: asa-frontend-conventions
description: Frontend UI conventions, TanStack Query patterns, apiRequest usage, form handling, iOS/Safari workarounds, Shadcn/Tailwind styling, routing, and layout shells for the ASA Learning Platform. Use when building frontend components, making API calls, creating forms, styling pages, or working with the educator layout.
---

# ASA Frontend Conventions

## Core Rules

- **Never use bare `fetch()`** for authenticated endpoints — use TanStack Query (GET) or `apiRequest` (mutations). See `asa-auth-patterns` for details.
- **Never define custom `queryFn`** in `useQuery` — the default fetcher in `queryClient.ts` handles auth headers, token refresh, and error tracking automatically.
- **Never import React explicitly** — Vite's JSX transformer handles it.
- **Server is the source of truth** for all pricing, enrollment status, and role data — frontend only displays.
- **Use `@`-prefixed imports** for all project files — `@/components/...`, `@/lib/...`, `@/hooks/...`.
- **Use `import.meta.env.VITE_*`** for frontend env vars — not `process.env`.

## Data Fetching

### GET Requests — TanStack Query
```typescript
const { data, isLoading } = useQuery<ResponseType>({
  queryKey: ['/api/educator/classes'],
});
```
- No `queryFn` needed — default fetcher attaches auth token and active role header
- Hierarchical keys use arrays: `queryKey: ['/api/classes', id]` — never template literals
- Array keys auto-join into URL path: `['/api/staff', 5]` → `/api/staff/5`
- `staleTime: Infinity` by default — data doesn't auto-refetch

### Mutations — `apiRequest`
```typescript
import { apiRequest, queryClient } from '@/lib/queryClient';

const mutation = useMutation({
  mutationFn: (data) => apiRequest('POST', '/api/endpoint', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/endpoint'] });
  },
});
```
- Always invalidate cache by `queryKey` after mutations
- `apiRequest` auto-detects `FormData` and omits `Content-Type` header for file uploads
- Returns raw `Response` — call `.json()` on it if you need parsed data

### Loading & Error States
- Always show loading/skeleton state while `isLoading` is true
- Show spinner or disabled state during mutations via `isPending`
- Use `useToast()` from `@/hooks/use-toast` for success/error notifications

## Forms

- Use Shadcn's `Form` component from `@/components/ui/form` (wraps `react-hook-form`)
- Use `zodResolver` with Drizzle insert schemas from `@shared/schema.ts`
- Extend schemas with `.extend()` for additional validation rules
- Always pass `defaultValues` to `useForm` — controlled components require them
- Debug tip: log `form.formState.errors` if a form silently fails to submit

## Routing

- **Router**: `wouter` — use `Switch`, `Route`, `Link`, `useLocation`
- **Page files**: `client/src/pages/` directory, registered in `client/src/App.tsx`
- **Lazy loading**: Most pages use `lazy(() => import('./pages/...'))` with `Suspense`
- **Navigation**: Use `Link` component or `useLocation` hook — never `window.location` for internal navigation
- **Eagerly imported pages**: Some pages (Login, Register, Home) are eagerly imported to avoid suspension errors with wouter's synchronous navigation

## Layout Shells

### Educator Shell (`EducatorAppShell`)
- Fixed desktop sidebar (64px width `lg:w-64`) with dark slate theme (`bg-slate-900`)
- Mobile: Collapsible `Sheet` menu triggered by hamburger icon
- Contains: navigation items, school branding, role switcher, notification badge, logout
- Wrapped in `StaffGuideProvider` for contextual tooltips
- Navigation items defined in `educatorNavigationItems` array

### Role Switching in Shells
- `RoleSwitcher` component shown if user has multiple roles at current school
- `useRole()` provides `activeRole`, `availableRoles`, `setActiveRole(roleId)`
- Role switch invalidates cached data

## Styling & UI

### Shadcn + Tailwind
- Use existing Shadcn components (`Button`, `Card`, `Dialog`, `Sheet`, `Badge`, etc.)
- Import via `@/components/ui/...`
- Icons from `lucide-react` for actions, `react-icons/si` for brand logos
- Colors defined in `client/src/index.css` — use CSS variables (`hsl(var(--primary))`)

### Responsive Design
- Mobile-first: start with mobile layout, add `sm:`, `md:`, `lg:` breakpoints
- Grid layouts: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Sidebar collapses to Sheet on mobile (`lg:hidden` / `hidden lg:flex`)

### iOS/Safari Workarounds
- **Date/select inputs**: Add `style={{ fontSize: '16px' }}` to prevent Safari auto-zoom on focus
- **Viewport height**: Use `100dvh` or `svh` instead of `100vh` for consistent iOS viewport
- **CSS detection**: `@supports (-webkit-touch-callout: none)` for iOS-specific styles
- **Stripe payments**: Must include `return_url` for iOS redirect flow

## Component Conventions

- `SelectItem` must always have a `value` prop — omitting it throws a runtime error
- Stock images only in contained cards/thumbnails — never as full-width section backgrounds (readability issues)
- Educator pages use `data-testid` attributes on interactive elements (e.g., `data-testid="button-mobile-menu"`)

## Context Providers

- `SupabaseProvider` → `useAuth()` for user identity, session, login/logout
- `RoleProvider` → `useRole()` for active role, available roles, role switching
- `CartProvider` → cart state management with TanStack Query
- `NotificationProvider` → real-time unread notification counts
- `InteractiveTutorialProvider` → in-app tutorial system
- `StaffGuideProvider` → contextual educator tooltips

## Common Pitfalls

- **Paginated endpoint causes `.map is not a function`** → typed query as `any[]` against an endpoint that returns `{ items: [], total: N }` — when data loads, the object replaces the `[]` default and `.map` fails → type as the full response shape and derive the array: `const { data } = useQuery<{ items: any[] }>({...}); const list = data?.items ?? [];`
- **Copied custom `queryFn` + bare `fetch()` from StaffInvitePage** → `StaffInvitePage.tsx` contains a pre-existing pattern violation; it bypasses token refresh, error tracking, and the `X-Active-Role` header → always use the default fetcher; never define a custom `queryFn`
- **Toast import error** → imported `useToast` from Shadcn UI directory → import from `@/hooks/use-toast` instead
- **Form silently won't submit** → validation fails on fields without visible error display → log `form.formState.errors` to find the failing field
- **`SelectItem` crashes at runtime** → missing `value` prop on `<SelectItem>` → always include `value="..."` prop
- **Cache invalidation doesn't work** → used template literal queryKey `` [`/api/classes/${id}`] `` → use array segments `['/api/classes', id]`
- **`['/api/enrollments']` vs `['/api/parent/enrollments']`** → these are two separate cache key prefixes; invalidating one does not invalidate the other. Admin enrollment views use `/api/enrollments`; parent payment balance and Outstanding Balance card use `/api/parent/enrollments`. After any payment, invalidate both if the data is visible to both roles.
- **API calls return 401 unexpectedly** → used bare `fetch()` without auth headers → use `apiRequest` or the default TanStack Query fetcher
- **Hardcoded cultural/religious content in templates** → used specific subjects like "Arabic Language Arts" or "Islamic Studies" as sample data → always use neutral examples like "Math 101", "Science Basics"
- **iOS Safari auto-zooms on input focus** → input `fontSize` is below 16px → add `style={{ fontSize: '16px' }}` to date/select inputs

## Best Practices

### Do
- Always invalidate TanStack Query cache after mutations using `queryClient.invalidateQueries({ queryKey: [...] })`
- Always use array-style `queryKey` for parameterized endpoints — `['/api/classes', id]` not `` [`/api/classes/${id}`] ``
- Always pass `defaultValues` to `useForm` — Shadcn's form component is controlled and requires them
- Always add `style={{ fontSize: '16px' }}` to date and select inputs to prevent iOS Safari auto-zoom
- Always use `Link` from wouter for internal navigation — `window.location` bypasses the SPA router
- Always show `isLoading` skeleton/spinner for queries and `isPending` disabled state for mutations

### Don't
- Don't define custom `queryFn` in `useQuery` — the default fetcher in `queryClient.ts` handles auth, refresh, and error tracking
- Don't use bare `fetch()` for authenticated endpoints — it skips auth headers, `X-Active-Role`, token refresh, and error tracking
- Don't import React explicitly — Vite's JSX transformer does it automatically
- Don't use `process.env` on the frontend — use `import.meta.env.VITE_*` (vars must be prefixed with `VITE_`)
- Don't use `100vh` for full-height layouts — use `100dvh` or `svh` for iOS Safari viewport consistency
- Don't use stock images as full-width section backgrounds — use gradients or solid colors instead
- Don't hardcode cultural, religious, or demographic content in sample data, CSV templates, or placeholder text — always use neutral, generic examples

## Class Data Fetching Pattern (Important)

Two separate pages list classes for parents, each using a **different API endpoint**:

| Page | Route | API Endpoint | Filtering |
|------|-------|-------------|-----------|
| `ProgramsPage.tsx` | `/programs` | `/api/classes` (public) | Server-side: hides expired (`endDate < now`), admin-only classes |
| `ProgramsParentPage.tsx` | `/parent/programs` | `/api/school-admin/classes` (admin) | Client-side: must filter expired classes in the `.map()` transformation step |

**Why this matters:** Any server-side class visibility filtering (expired classes, admin-only, etc.) applied to public `/api/classes` endpoints will **NOT** automatically apply to the parent programs page. The `ProgramsParentPage` fetches from `/api/school-admin/classes` and transforms the response client-side (lines ~254-279). Filtering must be applied in **both** places.

**Other public class endpoints with server-side end-date filtering:**
- `GET /api/classes/category/:categoryName`
- `GET /api/classes/categories/names`
- `GET /api/classes/published`
- `GET /api/registration/classes`

**Admin endpoints (intentionally unfiltered):**
- `GET /api/school-admin/classes` — used by admin views AND `ProgramsParentPage`
- `GET /api/admin/classes` — platform admin

## Key Files
- `client/src/lib/queryClient.ts` — `apiRequest`, default fetcher, `queryClient`, token refresh
- `client/src/App.tsx` — route definitions, lazy imports, provider tree
- `client/src/pages/ProgramsPage.tsx` — public class listing (uses `/api/classes`)
- `client/src/pages/ProgramsParentPage.tsx` — parent class listing (uses `/api/school-admin/classes`, needs client-side filtering)
- `client/src/components/layout/EducatorAppShell.tsx` — educator layout shell with sidebar
- `client/src/components/SupabaseProvider.tsx` — `useAuth()` hook, Supabase session management
- `client/src/contexts/RoleContext.tsx` — `useRole()` hook, role switching logic
- `client/src/contexts/CartContext.tsx` — cart state with TanStack Query
- `client/src/hooks/use-toast.ts` — toast notification hook
- `client/src/index.css` — CSS variables, theme colors, iOS workarounds
- `client/src/lib/utils.ts` — `formatDate()`, `formatClassSchedule()`, utility functions
