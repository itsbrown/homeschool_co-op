# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application designed for the American Seekers Academy. It delivers a comprehensive educational experience through a full-stack web architecture, integrating AI for content generation and robust assessment tools. The platform aims to provide personalized learning, efficient administration, and a secure, user-friendly environment, positioning itself as a leader in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The platform is built on a full-stack architecture prioritizing scalability, security, and user experience. It incorporates role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security.

**Frontend:**
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.
-   **State Management**: React hooks and context.

**Backend:**
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication; protected API endpoints use `supabaseAuth` and map Supabase UUID to an integer ID.

**Data Persistence:**
-   **Primary Database**: PostgreSQL (Neon-hosted) for all application data.
-   **ORM**: Drizzle ORM for CRUD operations, with schema defined in `shared/schema.ts` for type safety.
-   **Supabase**: Exclusively for authentication, not for general data persistence.

**Key Features:**
-   **Authentication & Authorization**: Supabase-based secure authentication with role-based access control, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: Supports dynamic, school-context-restricted role-switching.
-   **School Branding & Membership**: Allows school administrators to manage branding, annual membership fees, and enrollment validation.
-   **Payment System**: Stripe-only with subscription schedules, webhooks, smart cart logic, and server-side authoritative pricing.
-   **Cart & Discount Systems**: TanStack Query-based cart with API-first state management; database-managed comprehensive discount system (19+ types).
-   **Enrollment & Class Management**: Manages enrollment workflows, prevents duplicates, and allows school administrators to create/manage classes with multi-variant pricing.
-   **AI Integration**: AI Enrollment Assistant for personalized guidance; AI Smart Tutorial System (Anthropic Claude) for conversational help; AI Payment Help Assistant (Anthropic Claude) for payment inquiries.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Student Management System**: Tracks students across schools.
-   **Notification System**: In-app notifications with PostgreSQL storage and real-time unread counts.
-   **System Error Monitoring**: Comprehensive error tracking with database logging and automatic notifications.
-   **Unified Credit System**: Extensible multi-type credit system (volunteer, referral, achievement, marketing, manual, fundraiser) with admin approval, FIFO consumption, and automatic in-app notifications when credits are created/approved/rejected (includes title, amount, description, and expiration date).
-   **Fundraiser System**: Complete management for product-based campaigns for schools, including storefront and credit integration.
-   **Refund Management System**: Comprehensive refund processing with pro-rated calculator, structured reason codes, and analytics.
-   **Payment Reminder Tracking System**: Complete audit logging for automatic and manual payment reminders with school admin visibility.
-   **Educator Dashboard**: Tools for educators to manage classes, attendance, lesson plans, and log work hours, integrated with Daily Flow.
-   **Unified File Upload System**: Production-grade system using Replit App Storage for secure, scalable file handling with category-based validation and presigned URLs.
-   **Reading Assessment Tracking System**: McCall-Crabbs format with auto-averaging of grade-level scores, automatic Lexile score conversion (200 + gradeLevel × 100), assessment source tracking ('manual_entry' | 'in_app'), parent progress viewing with Recharts charts, and admin aggregate reporting with class/student/type filters.

**Core Architectural Principles:**
-   **Scheduled Payment Synchronization System**: Ensures scheduled payment statuses sync with actual payments via real-time and daily batch reconciliation.
-   **Immediate Payment Confirmation**: After successful Stripe payment, client immediately calls `/api/scheduled-payments/:id/confirm` with paymentIntentId for server-side verification before updating status. Includes security checks: scheduledPaymentId metadata match, parentEmail verification, amount validation, and idempotency handling (webhook backup safe).
-   **Payment Allocation Audit Trail**: Complete audit trail for payment disbursement via `payment_allocations` table. Supports both enrollment (`enrollmentId`) and membership (`membershipEnrollmentId`) allocations with `allocationType` enum ('payment', 'membership', 'refund', etc.). Scheduled payment confirmations create allocation records with cross-reference metadata (totalPaymentReceived, membershipDeducted, enrollmentAllocated) for reconciliation.
-   **Membership Fee Priority Disbursement**: When biweekly payments include membership fees (first payment), the membership amount is allocated first from total payment, with remaining amount going to class enrollment. Authoritative split computed once per confirmation with validation.
-   **Server-Authoritative Cart Pricing**: The server is the single source of truth for all cart pricing to prevent payment mismatches.
-   **Server-Authoritative Enrollment Payment Display**: `totalPaid` and `remainingBalance` fields on enrollment are the single source of truth for payment display.
-   **Promo Code Validation**: Checkout endpoint validates promo codes server-side and rejects payments if a provided promo code cannot be applied (returns detailed error reason).

## Development Patterns

**Multi-Role Access Control (Frontend):**
-   Always import `useAuth` from `@/components/SupabaseProvider` (NOT from `@/hooks/useAuth0`).
-   For role-based access checks, use `activeRole` from `useRole()` context (`@/contexts/RoleContext`), NOT `user.role`.
-   `user.role` is the user's primary role; `activeRole` is the currently selected role (users can switch roles via dropdown).
-   Include `activeRole` in useEffect dependency arrays when using it for access control.
-   Reference pattern: `client/src/pages/SchedulePage.tsx`

**Object Storage Paths:**
-   New uploads use `/objects/.private/documents/...` format (Replit App Storage).
-   Legacy uploads use local filesystem paths.
-   Delete endpoints should check for `/objects/` prefix to determine storage type.

**Database Column Naming:**
-   Database uses snake_case (`enrollment_id`, `scheduled_date`).
-   Drizzle schema uses camelCase (`enrollmentId`, `scheduledDate`).

**Orphaned Data Patterns:**
-   `scheduled_payments` with `enrollmentId` pointing to deleted `program_enrollments` may appear in parent views but are filtered out of admin views.
-   Admin views typically filter by valid enrollment joins only.

**iOS/Safari Compatibility:**
-   CSS uses `@supports (-webkit-touch-callout: none)` to target iOS Safari and sets `font-size: 16px` on all inputs to prevent auto-zoom on focus.
-   Stripe payments use `confirmPayment` with `return_url` redirects (not popups), making them Safari-compatible.
-   Mobile-first responsive design with `grid-cols-1 md:grid-cols-2` patterns for form layouts.
-   Platform uses `100dvh`/`svh` viewport units for consistent iOS viewport handling.

## External Dependencies
-   **Supabase**: Authentication.
-   **Replit App Storage**: Object storage for file uploads.
-   **Neon PostgreSQL**: Primary database.
-   **Stripe**: Payment processing.
-   **Anthropic Claude API**: AI content generation and analysis.
-   **Brevo SMTP**: Email service.
-   **SendGrid**: Email service.
-   **Twilio**: SMS service.

## Recent Changes

### Multi-Guardian System (Implemented Feb 2026)
Multiple guardians can be linked to each child account, allowing shared access for family members.

**Database:**
- `child_guardians` table with `childId`, `guardianUserId`, `relationship`, `isPrimary`, `addedBy`, `notes`, `createdAt`
- Unique constraint on (`child_id`, `guardian_user_id`) prevents duplicates
- Cascade delete on both `child_id` and `guardian_user_id` foreign keys

**Endpoints:**
- `GET /api/children/:childId/guardians` - List guardians for a child (parent, guardian, or admin access)
- `POST /api/children/:childId/guardians` - Add guardian by email (parent or admin only)
- `DELETE /api/children/:childId/guardians/:guardianId` - Remove guardian (parent or admin only)

**Architectural Notes:**
- Permission checks use `getUserRolesByUserId()` for multi-role + legacy `user.role` fallback
- Guardian-linked children appear in `/api/parent/children` response with `isGuardianLinked: true` flag
- `/api/parent/children/:id` allows guardian access (checks `child_guardians` table)
- Guardian UI tab on child profile page with add/remove functionality
- iOS/Safari compatible inputs with 16px font-size
- Routes mounted at `/api/children` with `supabaseAuth` middleware

### Consolidated Family Payments (Implemented Feb 2026)
Parents with multiple children can now pay all installments due on the same date as a single combined Stripe transaction.

**Endpoints:**
- `GET /api/scheduled-payments/grouped` - Groups pending payments by due date with per-payment details and combined totals
- `POST /api/scheduled-payments/pay-combined` - Creates single Stripe PaymentIntent for multiple scheduled payments with server-authoritative totals, per-payment credit application, and combined metadata
- `POST /api/scheduled-payments/confirm-combined` - Server-side confirmation: marks all payments completed, updates enrollment balances, creates payment allocation audit records with idempotency

**Architectural Notes:**
- Server-authoritative: All grouping, totals, and credit application calculated server-side
- Metadata stores `scheduledPaymentIds` (comma-separated), `perPaymentAmounts` (JSON), `paymentType: combined_scheduled_payment`
- Webhook handler acts as backup for combined payments with full idempotent per-payment processing
- Individual `scheduled_payments` records remain unchanged (grouping is query-time only)
- Follows immediate payment confirmation pattern: client calls confirm-combined after Stripe payment succeeds
- Payment failure handler resets all combined payments from `processing` back to `pending`
- UI falls back to non-grouped individual payment view if grouped endpoint fails