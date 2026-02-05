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

## Future Features

### Consolidated Family Payments
Parents with multiple children each having enrollments currently manage separate payment plans per enrollment. This feature consolidates payments into a single family payment experience.

**Problem:** Parents with 2+ children make 2+ separate payments on the same due date, creating friction and confusion.

**Solution:** Keep existing `scheduled_payments` structure (one record per enrollment) but add a presentation/checkout layer that groups payments by due date.

**Implementation Tasks:**
1. Create GET `/api/scheduled-payments/grouped` endpoint - server groups payments by due date, calculates combined totals
2. Create POST `/api/scheduled-payments/pay-combined` endpoint - accepts array of payment IDs, validates ownership, creates single Stripe PaymentIntent with payment IDs in metadata
3. Create POST `/api/scheduled-payments/confirm-combined` endpoint - verifies Stripe payment, marks all payments completed, creates `payment_allocation` records with cross-reference metadata
4. Update BillingPage.tsx - use grouped endpoint, add "Pay All Due [Date]" buttons with server-provided totals
5. Add confirmation flow with breakdown - show children/classes included before payment
6. End-to-end Playwright test with multi-child family scenario

**Architectural Notes:**
- Server-authoritative: All grouping and totals calculated server-side
- Maintains existing audit trail via `payment_allocations` table
- Individual `scheduled_payments` records remain unchanged (grouping is query-time)
- Follows immediate payment confirmation pattern with combined confirmation endpoint