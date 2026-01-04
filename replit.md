# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience, incorporating role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.
-   **State Management**: React hooks and context.

### Backend
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication using `supabaseAuth`. All protected API endpoints must use `supabaseAuth` and extract user email from `req.user.email`, mapping Supabase UUID to a database integer ID in `req.user.id`.

### Data Persistence Architecture
**Source of Truth**: PostgreSQL (Neon-hosted) is the authoritative data store for all application data.
-   **Drizzle ORM**: Primary data layer for all CRUD operations, with schema defined in `shared/schema.ts` for type safety.
-   **Supabase**: Reserved exclusively for authentication (OAuth on frontend, auth admin operations on backend) and NOT for general data persistence.

### Key Features
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, user metadata auto-sync, and blocked OAuth registration for un-registered school users.
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, payment reminders, and server-side authoritative pricing with strict validation. All Stripe webhooks are consolidated into a single secure endpoint `/api/stripe/webhook` with mandatory signature verification.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management and race condition prevention, including server-side authoritative discount calculations.
-   **Discount Systems**: Database-managed comprehensive discount system supporting 19+ discount types (percentage, fixed, bundle, sibling) with various application methods (automatic, manual), eligibility filters (role-based, min order amount, max cap), and combinability rules.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows, integrates with cart-to-checkout, and requires admin approval for $0 total enrollments.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **Registration Flow**: Two-tier registration with school code validation and transactional role creation.
-   **AI Enrollment Assistant**: Provides personalized AI guidance.
-   **Staff Management & Invitation System**: Automated onboarding and secure token-based invitations.
-   **User Account Management**: School administrators can send account invites and password reset emails.
-   **Welcome Email System**: Automated, school-branded HTML welcome emails.
-   **Parent Profile Management**: Parent users can update profiles; school administrators view profiles with multi-tenant data isolation.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools, including auto-sync for existing children.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **Category Management System**: School-level custom category system with dynamic dropdown integration and idempotent seeding of default categories.
-   **Interactive Onboarding Tour**: Custom-built guided tour for new parent accounts.
-   **Subscription Status Toggle**: School admin-configurable toggle to control subscription status display during checkout.
-   **AI Smart Tutorial System**: Conversational AI guidance using Anthropic Claude with context-aware help, rate limiting, conversation truncation, dynamic UI element highlighting, and page-specific suggestions.
-   **System Error Monitoring**: Comprehensive error tracking and notification system with database logging, severity levels, automatic email notifications for critical errors, daily summaries, React Error Boundary, Express error middleware, and an admin dashboard.
-   **Unified Credit System**: Extensible multi-type credit system supporting volunteer, referral, achievement, marketing, and manual credits. Features a single `credits` table, admin approval workflow, FIFO consumption during checkout, an expiration service, and a reserve-then-finalize pattern for credit consumption using `credit_holds` table (credits are held during checkout, finalized on success, released on failure).

### Educator Dashboard
Provides educators/mentors with tools to manage classes, track attendance, view lesson plans, and log work hours. It integrates with the Daily Flow system and features a dedicated `EducatorAppShell` with role-specific routing and an emerald color scheme. Key features include session management, attendance tracking, and a weekly calendar.

## External Dependencies
-   **Supabase**: Authentication.
-   **Neon PostgreSQL**: Primary database.
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

## Known Issues & Patterns to Avoid

### Past Bugs - Do Not Repeat
| Issue | Root Cause | Prevention |
|-------|-----------|------------|
| **UNIFIED_TOTAL_MISMATCH** | Client calculated prices differently than server | Server-authoritative pricing - NEVER trust client-side price calculations. Always validate totals server-side before processing payments. |
| **Foreign key deletion failures** | Complex table dependencies (25+ tables reference users) | Check foreign key relationships before deletions. Delete in correct dependency order: child tables first, parent tables last. |
| **Column naming confusion** | PostgreSQL uses snake_case (first_name), TypeScript uses camelCase (firstName) | Always reference `shared/schema.ts` for correct column names. Never guess. |
| **Stale cache bugs** | Forgetting to invalidate TanStack Query cache after mutations | Always call `queryClient.invalidateQueries({ queryKey: [...] })` after every mutation. |
| **Multi-tenant data leaks** | Missing schoolId filters on queries | EVERY database query MUST include schoolId scoping. No exceptions. |
| **ID column type changes** | Changing serial to varchar or vice versa breaks migrations | NEVER change primary key ID column types. Match existing schema exactly. |

### Dangerous Patterns
- **Don't calculate prices client-side** for checkout - always fetch from server
- **Don't delete user records** without checking all 25+ dependent tables
- **Don't use `npm run db:push`** without checking existing schema first
- **Don't assume column names** - always verify in schema.ts
- **Don't skip cache invalidation** - stale data causes mysterious bugs

### Required Validation Steps
1. **Before payments**: Server must validate all prices, discounts, credits
2. **Before deletions**: Map all foreign key dependencies
3. **Before schema changes**: Check existing database structure
4. **Before completing features**: Test multi-tenant isolation (schoolId filtering)
5. **After mutations**: Invalidate relevant TanStack Query cache keys

## Development Checklist (Per Feature)

### Schema & Data Layer
- [ ] Define tables in `shared/schema.ts` with insert/select schemas using `drizzle-zod`
- [ ] Add foreign keys to schools/locations for multi-tenant isolation
- [ ] Update `IStorage` interface in `server/storage.ts` with typed CRUD methods
- [ ] Run `npm run db:push` to sync schema (use `--force` if needed)

### API Endpoints
- [ ] Create routes in `server/api/` with `supabaseAuth` + `requireSchoolContext` middleware
- [ ] Validate ALL request bodies with Zod schemas before storage calls
- [ ] Enforce `schoolId` scoping on EVERY query - no exceptions
- [ ] Add role checks (educator/admin/parent) where needed
- [ ] Log errors to `errorLogs` via `storage.createErrorLog`
- [ ] Return consistent error responses with status codes

### Frontend
- [ ] Use TanStack Query v5 (object form only): `useQuery({ queryKey: [...] })`
- [ ] Use shadcn forms with `zodResolver` for validation
- [ ] Add `data-testid` to ALL interactive and display elements
- [ ] Show loading/skeleton states during queries (`.isLoading`)
- [ ] Show pending states during mutations (`.isPending`)
- [ ] Toast feedback for all mutations (success and error)
- [ ] Invalidate cache after EVERY mutation

### Testing Requirements
- [ ] Integration tests for each endpoint using supertest
- [ ] Test multi-tenant isolation (verify schoolId filtering works)
- [ ] Test 0-result scenarios (empty states)
- [ ] Test permission boundaries (parents can't see other families' data)
- [ ] For pricing features: Add regression tests to prevent UNIFIED_TOTAL_MISMATCH

### Security Checklist
- [ ] Parents can ONLY see their own children's data
- [ ] Educators scoped to their assigned locations
- [ ] Admins scoped to their school only
- [ ] Sanitize all file upload inputs
- [ ] PDF/export endpoints verify ownership (prevent IDOR attacks)
- [ ] Rate limit expensive operations (AI, exports, uploads)

### Performance
- [ ] Use SQL views for heavy report aggregations
- [ ] Paginate large result sets
- [ ] Use proper TanStack Query cache keys for efficient caching
- [ ] Consider materialized views for expensive nightly reports

## Upcoming Features Roadmap

### Reporting & Assessment System (In Progress)
**Financial Reports:**
- Payment Status (paid/partial/unpaid)
- Expected Revenue (from payment schedules)
- Late Payments (aging buckets: 7/14/30/60+ days)
- Credits Dashboard (household balances, expiring, usage)

**Student Progress Tracking (Database Tables Created Jan 2026):**
- ✅ `assessment_types` table: School-scoped assessment categories (McCall-Crabbs, Phonograms, Math, etc.) with flexible scoring formats (numeric, fraction, level, percentage, letter_grade)
- ✅ `curriculum_books` table: Book-based curricula tracking for assessment types with lesson counts
- ✅ `student_assessments` table: Individual student progress records with school/location scoping, curriculum book references, and score tracking
- 🔲 API endpoints for CRUD operations (pending)
- 🔲 Admin UI for managing assessment types (pending)
- 🔲 Location-based views and comparisons (pending)
- 🔲 AI-powered assessment upload with smart column mapping (pending)

**Documents:**
- Report Card generator with PDF export
- Transcript generator with PDF export

## Pricing Tiers (Planned)

| | **Free** | **Starter** | **Growth** | **Enterprise** |
|---|----------|-------------|------------|----------------|
| **Students** | Up to 25 | Up to 50 | Up to 200 | Unlimited |
| **Staff** | 1 admin | 3 staff | 10 staff | Unlimited |
| **Locations** | 1 | 1 | 1 | Multiple |
| **Classes** | 3 | Unlimited | Unlimited | Unlimited |
| **Payments** | No | Yes | Yes | Yes |
| **AI Features** | No | No | Basic | Full |
| **Marketing Hub** | No | No | No | Yes |
| **Credit System** | No | No | Yes | Yes |
| **Extensions** | Purchase | Purchase | Purchase | Included |