# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It delivers a comprehensive and engaging educational experience through a full-stack web architecture, AI-powered content generation, and assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Development Guidelines
For detailed development and testing guidelines, see:
- **[Development Testing Checklist](./DEVELOPMENT_TESTING_CHECKLIST.md)** - Pre-completion verification checklist for middleware, functions, and database changes
- **[Architectural Patterns & Common Pitfalls](./ARCHITECTURAL_PATTERNS.md)** - 7 key patterns with code examples and real bug scenarios from Nov 22, 2025

### Recent Changes
**Nov 25, 2025**
- **Payment Reminder System**: Implemented comprehensive payment reminder system to ensure parents complete enrollment payments:
  - **Parent Dashboard Alert Banner**: Prominent amber alert banner showing when pending_payment enrollments exist, with direct link to cart/checkout
  - **Payments Stats Card**: Updated stats grid with "Payments" card using warning styling (amber) when unpaid enrollments exist
  - **Cart Drawer Notice**: Alert at top of cart drawer reminding parents that payment is required to secure spots
  - **Email Reminder Functions**: Created `sendEnrollmentReminderEmail` and `sendBulkEnrollmentReminderEmail` functions in `server/services/emailService.ts` for nicely formatted HTML payment reminder emails
  - **Enrollment Reminder Scheduler**: Scheduled job in `server/services/enrollmentReminderScheduler.ts` that runs every 6 hours to send automatic payment reminders for pending_payment enrollments
  - **Reminder Tracking**: Added `last_reminder_sent_at` and `reminder_count` columns to `school_class_enrollments` table with 72-hour throttling and max 5 reminders per enrollment
  - **Database Migration**: Added migration in `server/init-db.ts` for reminder tracking columns

**Nov 24, 2025**
- **Parent Registration & Dashboard Access Fix**: Fixed loading screen issue preventing newly registered parents from accessing their dashboard:
  - **Root Cause**: RoleContext only read `roles` array from API, ignoring fallback `activeRole` field for users without `user_roles` entries
  - **Fix**: Updated `client/src/contexts/RoleContext.tsx` to use API's `activeRole` field (which falls back to `users.role`) when no user_roles entries exist
  - **Impact**: Newly registered parents can immediately access ParentDashboard after registration without getting stuck at loading screen
  - **Pattern Compliance**: Maintains database as source of truth - API queries `users.activeRole || users.role` from PostgreSQL
- **Missing Schema Import Fix**: Added `insertMembershipEnrollmentSchema` import to `server/routes.ts` and `server/api/auth.ts` to fix membership enrollment creation errors
- **Location Persistence**: Parent registration now saves selected location to `user_locations` table for location-specific features
- **Critical Middleware Cache Fix**: Fixed production issue where school admin users couldn't access dashboard despite correct database associations:
  - **Root Cause**: jwtCheck middleware preserved schoolId from Supabase user_metadata, creating a stale cache that ignored database updates
  - **Fix**: Removed lines 34-38 in `server/middleware/auth0-auth.ts` that injected metadata schoolId into UserSyncService
  - **Impact**: Database is now ALWAYS the source of truth for schoolId - direct database updates take effect immediately without metadata synchronization
  - **Test Scenario**: User with admin_id in database can now access /my-school dashboard without "No School Found" error
- **Stripe Account Lookup Testing Infrastructure**: Implemented comprehensive testing infrastructure for Stripe account lookup feature:
  - **Test Endpoint**: Created `POST /api/stripe/test-account-lookup` for debugging account lookup logic with detailed diagnostics (Stripe customer search, subscription status, database verification, membership enrollments, actionable recommendations)
  - **TypeScript Fixes**: Resolved 10 TypeScript errors in `server/api/stripe.ts` related to membership enrollment creation and Stripe subscription property access
  - **Stripe Client Refactoring**: Centralized Stripe client to single exported instance in `server/config/stripe.ts` for better testability and consistency
  - **Automated Tests**: Created 13 integration tests for diagnostic endpoint (`server/tests/integration/stripe-account-lookup.test.ts`) with proper Stripe mocking, authentication validation, and response structure verification
  - **Test Database Enhancements**: Added `getUserById()` and `getMembershipEnrollmentsByParentId()` helper methods to `testDatabase.ts` for integration testing
  - **Manual Testing Guide**: Comprehensive guide (`STRIPE_ACCOUNT_LOOKUP_TEST_GUIDE.md`) with 5 test scenarios, curl examples, and debugging tips
  - **Storage Typing Documentation**: Documented CombinedStorage typing limitation (requires 127+ type fixes for full IStorage compliance - documented as technical debt)
  - **Note**: Payment intent sync logic tests created but require cart/enrollment setup to properly exercise database update paths (identified by architect review)

**Nov 23, 2025**
- **Membership Fee Currency Bug Fix**: Fixed double conversion bug where membership fees were being multiplied by 100 twice (once in frontend, once in backend), causing $175 to display as $17,500. Backend now accepts cents value directly from frontend without additional conversion, matching application-wide currency format pattern.
- **TypeScript Type Safety Complete Refactor**: Resolved all 97 LSP errors in `server/api/school-admin.ts` and normalized authentication middleware contract:
  - Created `server/middleware/types.ts` with Express module augmentation for type-safe middleware properties (id, email, sub, role, schoolId, activeRoleId, permissions, name)
  - Normalized both session and bearer-token auth paths to use consistent numeric database IDs and Supabase UUID handling
  - Fixed `req.user.dbUser` undefined error in `/my-school` route by reading from `req.user` directly
  - Both auth paths now use `user.supabaseId || String(user.id)` for consistent `sub` normalization in `req.user.sub` and `req.auth.payload.sub`
  - Removed all `as any` casts from authentication middleware for improved type safety
  - Added 401 enforcement for users without database records
- **Settings Page Consolidation**: Unified school admin settings into SchoolSettingsPage at `/schools/settings` with 4 tabs (Profile, Security, Notifications, School Configuration). Deprecated legacy `/school-settings` route. School Configuration tab includes membership fee management (amount, renewal date, grace period, required toggle) and logo upload.
- **Parent Profile Access Control Fix**: Fixed access control to allow school admins to view parents who have roles in their school (even without enrolled children/memberships)
- **Database Schema Sync Fix**: Added missing columns to `membership_enrollments` table (membership_year, amount, remaining_balance, due_date, expiration_date, grace_period_end, payment_date) to match Drizzle schema definition
- **Parent Profile Fix**: Resolved 500 error on parent profile page caused by missing database columns

**Nov 22, 2025**
- **Critical Middleware Import Fix**: Fixed missing `requireSchoolContext` import in `server/api/school-admin.ts` that caused silent failures
- **Removed Duplicate Functions**: Eliminated local `extractSchoolId` and `requireSchoolContext` functions shadowing imported middleware
- **UsersPage Infinite Loading Fix**: Added `enabled: !!schoolId` check to React Query for proper async dependency handling
- **Database-Driven School Context**: All 39 school-admin endpoints now use PostgreSQL as single source of truth via `requireSchoolContext` middleware

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

### Data Storage
-   **Primary Database**: Neon PostgreSQL.
-   **File Storage**: Local filesystem for general files and knowledge bases.
-   **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.

### Key Features
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: Supports users holding multiple roles (e.g., parent AND educator) with dynamic, school-context-restricted role-switching capabilities.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management, race condition prevention, and atomic bulk cancellation.
-   **Discount Systems**: Database-managed Free After Threshold Discount System.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows, and integrates with the cart-to-checkout flow.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **Registration Flow**: Two-tier registration with school code validation.
-   **AI Enrollment Assistant**: Provides personalized AI guidance.
-   **Staff Management & Invitation System**: Automated onboarding and secure token-based invitations.
-   **User Account Management**: School administrators can send account invites and password reset emails.
-   **Welcome Email System**: Automated, school-branded HTML welcome emails.
-   **Parent Profile Management**: Parent users can update profiles; school administrators view profiles with multi-tenant data isolation.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing.
-   **Dedicated Detail/Edit Pages**: Specific pages for parent class details and editing child profiles.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools, including auto-sync for existing children.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **Category Management System**: School-level custom category system with dynamic dropdown integration and idempotent seeding of default categories.

## External Dependencies
-   **Supabase**: Authentication (OAuth) and PostgreSQL database.
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