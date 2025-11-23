# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive and engaging educational experience through a full-stack web architecture, AI-powered content generation, and assessment tools. The platform aims to deliver personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
### November 22, 2025 - Critical Middleware Import Fix
-   **Root Cause**: `requireSchoolContext` middleware was NOT imported in `server/api/school-admin.ts`, causing middleware to silently fail
-   **Duplicate Functions**: Removed duplicate local `extractSchoolId` and `requireSchoolContext` functions that were shadowing the imported middleware
-   **Fix Applied**: Added `import { requireSchoolContext } from '../middleware/require-school-context'` to properly import middleware
-   **Impact**: All 39 school-admin endpoints now properly use database-driven school context
-   **Pattern**: Always verify middleware imports; local function definitions can shadow imported functions causing silent failures

### November 22, 2025 - UsersPage Infinite Loading Fix
-   **Critical Bug Fix**: Fixed infinite loading issue on UsersPage by adding `enabled: !!schoolId` check to React Query
-   **Pattern Applied**: Admin pages using `useSchoolAdmin` hook must wait for schoolId before fetching data
-   **Affected Pages**: Verified StaffPage, StudentsPage, and DiscountsPage don't use `useSchoolAdmin` and are unaffected

### November 22, 2025 - Database-Driven School Context Migration Complete
-   **Endpoint Migration**: All 39 school-admin endpoints now use database-driven school context via `requireSchoolContext` middleware
-   **Data Source**: PostgreSQL database (via Drizzle ORM) is the single source of truth; JWT metadata deprecated for school context
-   **Type Safety**: Consistent type normalization applied across all endpoints (String() for comparisons, Number() for storage calls)
-   **Endpoints Migrated**: Final 9 unmigrated endpoints completed (POST /classes, GET /metrics/staff, POST /discounts, POST /contact-import, GET /users, GET /users/:userId, POST /users, PUT /users/:id, DELETE /users/:id)
-   **Architecture**: Supabase reserved exclusively for authentication; all data operations use Drizzle ORM

## Development Testing Checklist
**Purpose**: Catch basic code issues (duplicate functions, shadowed imports, runtime errors) before architect review.  
**Origin**: Created in response to Nov 22, 2025 middleware import bug where duplicate local functions shadowed imported middleware.

### For Middleware/Import Changes
Before marking completed, verify:
- [ ] **Check for duplicate function definitions**
  ```bash
  # Search for ALL definitions of the function you're importing
  grep -rn "^function functionName\|^async function functionName" server/
  grep -rn "^export function functionName\|^export async function functionName" server/
  ```
- [ ] **Verify import is not shadowed by local function**
  ```bash
  # After adding import, check the same file doesn't define it locally
  grep -n "import.*functionName" file.ts
  grep -n "function functionName\|async function functionName" file.ts
  ```
- [ ] **Test affected endpoints** - Don't rely only on LSP (it misses runtime errors)
  - Test 2-3 endpoints that use the middleware
  - Check server logs for errors
  - Verify expected behavior (e.g., schoolId extracted correctly)
- [ ] **Architect review BEFORE marking completed** - Include git diff

### For Function Removal
Before marking completed, verify:
- [ ] **Search ALL files for remaining function calls**
  ```bash
  # Find all calls to the function you're removing
  grep -rn "functionName(" server/ client/
  ```
- [ ] **Check for local duplicates with same name**
  ```bash
  # Find all definitions across the codebase
  grep -rn "function functionName\|const functionName.*=.*function" .
  ```
- [ ] **Verify no references in other files**
  ```bash
  # Search for any mention of the function
  grep -rn "functionName" --include="*.ts" --include="*.tsx"
  ```

### For Database Schema Changes
Before marking completed, verify:
- [ ] **Never change primary key ID types** (serial ↔ varchar breaks existing data)
- [ ] **Check existing schema first**
  ```bash
  # Query database to see current column types
  npm run db:studio
  ```
- [ ] **Use safe push command**: `npm run db:push --force` (never write manual migrations)
- [ ] **Test with actual data** - Don't just check LSP

### General Pre-Completion Pattern
- [ ] **LSP only catches type errors** - Always test runtime behavior
- [ ] **Test the actual feature** - Click through UI or call API endpoints
- [ ] **Check server/browser logs** - Look for errors, warnings, unexpected output
- [ ] **Architect review catches issues** - Call before marking completed, not after
- [ ] **Include git diff in architect review** - Set `include_git_diff: true`

### Quick Verification Commands
```bash
# Find duplicate function definitions
grep -rn "^function extractSchoolId\|^async function extractSchoolId" server/

# Find all imports and local definitions (look for conflicts)
grep -n "import.*requireSchoolContext" server/api/school-admin.ts
grep -n "function requireSchoolContext" server/api/school-admin.ts

# Count how many times a function is defined (should be 1)
grep -rn "^function myFunction" . | wc -l

# Find all calls to a function across codebase
grep -rn "myFunction(" --include="*.ts" --include="*.tsx"
```

## System Architecture
### Core Design Principles
The platform emphasizes scalability, security, and user experience, incorporating role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.
-   **State Management**: React hooks and context.
-   **Currency Formatting**: Frontend formats currency values (stored as cents on backend) using `CurrencyUtils` from `shared/currency-utils.ts`.

### Backend
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication using `supabaseAuth`. All protected API endpoints must use `supabaseAuth` and extract user email from `req.user.email`. The middleware maps Supabase UUID to a database integer ID in `req.user.id` for multi-role API compatibility.

### Data Persistence Architecture
**Source of Truth**: PostgreSQL (Neon-hosted) is the authoritative data store for all application data. All backend data operations use Drizzle ORM for type-safe, direct database access.
-   **Drizzle ORM**: Primary data layer for all CRUD operations. Schema defined in `shared/schema.ts` provides type safety and direct PostgreSQL access.
-   **Supabase**: Reserved exclusively for authentication (OAuth on frontend, auth admin operations on backend) and NOT used for general data persistence.

### Data Storage
-   **Primary Database**: Neon PostgreSQL.
-   **File Storage**: Local filesystem for general files and knowledge bases.
-   **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
-   **Storage Architecture**: Hybrid system routing operations between persistent database and in-memory storage.

### Key Features
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: Users can hold multiple roles (e.g., parent AND educator) with dynamic role-switching capabilities limited to same-school contexts for security. Includes database junction tables, comprehensive backend APIs, React Query-based frontend integration with RoleContext and RoleSwitcher components, and an admin role management UI. Role switching is restricted to the same school to prevent cross-tenant data leakage.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management, race condition prevention, and atomic bulk cancellation.
-   **Discount Systems**: Database-managed Free After Threshold Discount System.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows, and integrates with the cart-to-checkout flow. Enrollment counts accurately reflect valid statuses.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **Registration Flow**: Two-tier registration with school code validation.
-   **AI Enrollment Assistant**: Provides personalized AI guidance.
-   **Staff Management & Invitation System**: Automated onboarding and secure token-based invitations.
-   **User Account Management**: School administrators can send account invites and password reset emails.
-   **Welcome Email System**: Automated, school-branded HTML welcome emails.
-   **Parent Profile Management**: Parent users can update profiles; school administrators view profiles with multi-tenant data isolation.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing.
-   **Parent Class Details Page**: Dedicated full-page view for class details.
-   **Edit Child Profile Page**: Dedicated page for editing child profiles.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools, including auto-sync for existing children.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **Category Management System**: School-level custom category system with dynamic dropdown integration and idempotent seeding of default categories.

## External Dependencies
-   **Supabase**: PostgreSQL database and OAuth authentication.
-   **Stripe**: Payment processing.
-   **Anthropic Claude API**: AI content generation and analysis.
-   **Stability AI**: Image generation.
-   **Hugging Face Inference API**: Text processing and analysis.
-   **Shadcn/ui**: React component library.
-   **Tailwind CSS**: CSS framework.
-   **Vite**: Build tool.
-   **Brevo SMTP**: Email service.
-   **SendGrid**: Email service.
-   **Twilio**: SMS service.