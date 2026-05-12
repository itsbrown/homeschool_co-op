# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive educational experience with AI-powered content generation and robust assessment tools through a full-stack web architecture. The platform aims to provide personalized learning, efficient administration, and a secure, user-friendly environment, aspiring to be a leader in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Git workflow
Branching, keeping `main` clean, worktrees, and tracked `data/*.json` fixtures: **[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)**. Contributor entry point: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Publish / Deploy Pre-Flight
These rules are mandatory for the agent on any manual Publish or production deploy request. Do not skip steps, do not reorder them, and do not approve a publish if any step fails.

1. **Follow the sync checklist in order.** Before any manual Publish or production deploy request, open and follow `docs/REPLIT_SYNC_CHECKLIST.md` end-to-end and in order: fetch, SHA match, align branch, `npm ci`, checks, smoke. No shortcuts.
2. **Confirm the SHA matches `origin/main`.** Run `git rev-parse HEAD`, paste the output into the conversation, and explicitly confirm it matches `origin/main` before approving the publish. If it does not match, stop.
3. **Stop and report blockers if the checklist cannot be completed.** If any step in `docs/REPLIT_SYNC_CHECKLIST.md` fails or cannot be run, do not publish. Report the specific blockers to the user and wait for direction.

## Debugging Guidelines
- **Trace the entire request flow from endpoint to database before making fixes**, not just the layer where the problem appears to be. Follow the code path through: API route → storage interface → actual storage implementation (database or memory) to ensure all layers are using the correct data source.
- **HybridStorage architecture**: `dbStorage` can be either DatabaseStorage or MemStorage (fallback). Use identity comparison (`this.dbStorage !== this.memStorage`) to detect real database availability.
- **Watch for duplicate storage mechanisms**: Some API files may have their own in-memory Maps or caches that bypass the central storage system entirely. Check for module-level variables in API route files.
- **Invitation-related bugs**: For any staff/role invitation issues, see **ARCHITECTURAL_PATTERNS.md Section 8** (Token-based Invitation Flow). Key rules: reuse tokens on resend (don't generate new), use public endpoints for unauthenticated access, and consolidate to role_invitations table.

## System Architecture
The platform features a full-stack architecture designed for scalability, security, and user experience. It incorporates role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security.

**Frontend:**
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.

**Backend:**
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication; protected API endpoints map Supabase UUID to an integer ID.
-   **Server Entry Point Split**: `server/index.ts` is the entry point that binds to port 5000 in < 250ms, registers `/health` and production static file serving immediately, then dynamically loads `server/app-init.ts` (all routers, middleware, schedulers) in the background. In production, `express.static(dist/public)` + SPA catch-all is registered **before** `httpServer.listen()` so Replit's health check probe at GET `/` always gets HTTP 200 instantly. The build uses esbuild `--splitting`: `dist/index.js` (~3.7 KB) and `dist/app-init-[hash].js` (~1.3 MB). **Do not add heavy module imports to `server/index.ts` — only Node.js builtins (path, fs, http) and express are allowed.**
-   **Deployment Type**: **MUST be Reserved VM** (not Autoscale). This app runs persistent background schedulers (auto-pay, enrollment reminders, credit expiration, reconciliation), uses WebSocket, and has in-memory state — all incompatible with Autoscale/Cloud Run. When publishing, verify the Replit publish dialog shows "Reserved VM". The `.replit` `deploymentTarget = "vm"` enforces this.

**Data Persistence:**
-   **Primary Database**: PostgreSQL. Replit dev uses the Replit-managed Helium database (plain TCP, no SSL); production uses a separate managed Postgres that requires SSL. Connection string is read exclusively from `DATABASE_URL`, and SSL is selected via `getDbSslConfig()` / `getPostgresJsSslOption()` in `server/lib/database-url.ts` based on `NODE_ENV`. The same module exposes `normalizeDatabaseUrl()` / `getNormalizedDatabaseUrl()`, which percent-encodes `DATABASE_URL` passwords containing URL-reserved characters (e.g. `+`, `?`, `)`) before they reach `pg` or `postgres-js`. All runtime DB consumers (`server/db.ts`, `server/db-url.ts`, `server/classes-db.ts`, `server/db/pgClient.js`, `server/stripeClient.ts`) use the normalized URL so a Supabase-style password no longer fails with "Invalid URL" at startup.
-   **ORM**: Drizzle ORM for CRUD operations, with type-safe schema.
-   **Supabase**: Exclusively for authentication.

**Key Features:**
-   **Authentication & Authorization**: Supabase-based secure authentication with role-based access control and multi-tenant security.
-   **Multi-Role System**: Supports dynamic, school-context-restricted role-switching.
-   **School Branding & Membership**: Management of branding, annual membership fees, and enrollment validation.
-   **Payment System**: Stripe-only with subscription schedules, webhooks, smart cart logic, and server-side authoritative pricing.
-   **Cart & Discount Systems**: TanStack Query-based cart with API-first state management; database-managed comprehensive discount system (19+ types).
-   **Enrollment & Class Management**: Manages enrollment workflows, prevents duplicates, and allows school administrators to create/manage classes with multi-variant pricing.
-   **AI Integration**: AI Enrollment Assistant, AI Smart Tutorial System (Anthropic Claude), AI Payment Help Assistant (Anthropic Claude), and Parent AI Concierge (action-capable conversational assistant as default parent landing page) for personalized guidance and support.
-   **Parent AI Concierge**: Default parent landing page with Claude tool-use API. Provides 8 action tools (lookup_classes, check_enrollments, check_payments, check_credits, check_waitlist, search_knowledge_base, add_to_cart, register_child). Features context sidebar, quick action chips, proactive alerts, and graceful fallback when AI is unavailable. Routes: `/dashboard` (concierge), `/parent/home` (legacy dashboard).
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Student Management System**: Tracks students across schools.
-   **Notification System**: In-app notifications with real-time unread counts.
-   **System Error Monitoring**: Comprehensive error tracking with database logging and automatic notifications.
-   **Unified Credit System**: Extensible multi-type credit system (volunteer, referral, achievement, marketing, manual, fundraiser) with admin approval and FIFO consumption.
-   **Fundraiser System**: Complete management for product-based campaigns for schools, including storefront and credit integration.
-   **Refund Management System**: Comprehensive refund processing with pro-rated calculator and structured reason codes.
-   **Payment Reminder Tracking System**: Audit logging for automatic and manual payment reminders with school admin visibility.
-   **Hardened Auto-Pay Scheduler**: Production-grade auto-pay with 6 safety behaviours: stuck-`processing` recovery (Stripe reconciliation), retry cap (3 attempts via `retryCount`), 14-day staleness cutoff (`getDueScheduledPayments` DB query), pre-charge notifications (in-app + email, 20h dedup), webhook retry cap, and DB-level due-payment query replacing in-memory filter. 10 integration tests (G1–G8 + 2 security) all pass. Credit auto-application is active by default (no env-var gate); when credits fully cover an installment parents receive an in-app + email notification confirming the credit-covered payment. The `AUTO_APPLY_CREDITS` feature flag has been removed — credits are always applied.
-   **Educator Dashboard**: Tools for managing classes, attendance, lesson plans, and logging work hours.
-   **Unified File Upload System**: Production-grade system using Replit App Storage for secure, scalable file handling with category-based validation and presigned URLs.
-   **Reading Assessment Tracking System**: McCall-Crabbs format with auto-averaging of grade-level scores, automatic Lexile score conversion, and parent/admin reporting.
-   **Multi-Guardian System**: Allows multiple guardians to be linked to child accounts with shared access.
-   **Consolidated Family Payments**: Parents can pay multiple installments due on the same date as a single combined Stripe transaction.
-   **Attendance & Check-In Management**: Comprehensive attendance tracking with QR code check-in, geolocation verification, and educator punctuality monitoring.
-   **Proration System**: Mid-session enrollment proration for classes with automatic calculation and admin visibility.

**Core Architectural Principles:**
-   **Scheduled Payment Synchronization System**: Ensures scheduled payment statuses sync with actual payments.
-   **Immediate Payment Confirmation**: Client confirms successful Stripe payments server-side for verification.
-   **Payment Allocation Audit Trail**: Complete audit trail for payment disbursement via `payment_allocations` table.
-   **Balance-Aware Payment Allocator (feature-flagged)**: When `BALANCE_AWARE_ALLOCATION=true`, `PaymentProcessorService.processPayment` weighs each enrollment by its current `effective_balance` instead of splitting the cart total evenly across enrollment IDs. Fully-paid enrollments in mixed carts receive `$0` and are never overpaid; the legacy even-split path remains the default until the flag is flipped. Defined in `server/lib/splitIntegerEvenly.ts` (`allocatePaymentByBalance`) with full coverage in `server/tests/splitIntegerEvenly.test.ts`.
-   **Membership Fee Priority Disbursement**: Membership amount is allocated first from total payment when included in biweekly payments.
-   **Server-Authoritative Cart Pricing**: Server is the single source of truth for all cart pricing.
-   **Server-Authoritative Enrollment Payment Display**: `totalPaid` and `remainingBalance` fields on enrollment are the single source of truth.
-   **Promo Code Validation**: Checkout endpoint validates promo codes server-side.

**Development Patterns:**
-   **Multi-Role Access Control (Frontend):** Uses `activeRole` from `useRole()` for access checks.
-   **Object Storage Paths:** Distinguishes between new uploads (`/objects/.private/documents/...`) and legacy uploads.
-   **Database Column Naming:** Uses snake_case in the database and camelCase in Drizzle schema.
-   **Orphaned Data Patterns:** `scheduled_payments` with deleted `program_enrollments` are filtered out of admin views.
-   **iOS/Safari Compatibility:** CSS adjustments (`@supports (-webkit-touch-callout: none)` and `font-size: 16px` on inputs) and `return_url` redirects for Stripe payments. Uses `100dvh`/`svh` for consistent iOS viewport handling.

## Documentation
-   **`docs/FUTURE_FEATURES.md`**: Searchable collection of fully designed future features with implementation plans, safeguards, and architecture decisions. Currently contains the Session-Based Enrollment Transition plan (F001).

## External Dependencies
-   **Supabase**: Authentication.
-   **Replit App Storage**: Object storage for file uploads.
-   **PostgreSQL**: Primary database (Replit-managed Helium in dev, managed SSL Postgres in production).
-   **Stripe**: Payment processing.
-   **Anthropic Claude API**: AI content generation and analysis.
-   **Brevo SMTP**: Email service.
-   **SendGrid**: Email service.
-   **Twilio**: SMS service.