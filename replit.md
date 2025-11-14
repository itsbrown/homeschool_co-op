# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform provides personalized learning paths, efficient administrative tools, and aims to deliver an adaptive, secure, and user-friendly learning environment for diverse educational needs.

## Recent Changes
### November 2025
- **Complete Payment System Modernization (November 14, 2025)**: Comprehensive update of entire payment and billing infrastructure:
  - **Authentication Migration**: Migrated all payment-history and scheduled-payments endpoints to Supabase-only authentication, removing all Auth0 dependencies
  - **Stripe API Integration**: Added `/api/stripe/subscription-schedules` and `/api/stripe/subscriptions` endpoints with proper data transformation
  - **Legacy Endpoint Deprecation**: Removed `/api/scheduled-payments/upcoming` endpoint, migrated POST `/pay` and PATCH `/:id/paid` to supabaseAuth
  - **Frontend Updates**: Updated PaymentManagement.tsx to consume new Stripe endpoints with correct phase index handling (fixed critical bug where currentPhase object was treated as numeric index)
  - **Payment History Enrichment**: Enhanced `/api/payment-history/history` to batch-fetch Stripe PaymentIntents and merge with database records, adding enriched fields (paymentPlan, enrollmentDetails, Stripe status/amount). Fixed critical bugs: (1) Amount validation - skip malformed Stripe intents with null/zero amounts, (2) Stripe-only payments set stripePaymentIntentId for unique React keys, (3) nextPaymentDate calculation accepts 'not_started' and 'active' schedules using subscription.current_period_end for accuracy. All currency amounts follow standardized pattern: backend sends raw cents (numbers), frontend formats using formatCurrency() helper.
  - **Storage Layer**: Added `getStripeCustomerIdsByParentEmail()` and `getStripeLinkedEnrollmentsByParentEmail()` helper methods
  - **Security**: All endpoints use consistent `req.user.email` extraction, admin endpoints verify schoolAdmin/superAdmin roles
- **Stripe API Integration & Authentication Migration (November 13, 2025)**: Completed comprehensive migration of all payment and billing endpoints to Supabase-only authentication. Added new Stripe API endpoints for subscription schedules and subscriptions, implemented proper admin role authorization for sensitive endpoints, and created storage helper methods for Stripe customer ID retrieval. All Auth0 dependencies removed from payment flows. See Authentication Standards section for implementation details.
- **BillingPage Payment Tabs**: Fixed Upcoming Payments tab data transformation to correctly parse Stripe subscription schedule API responses. Resolved CartContext type signature issue and lifted payment state management to parent component. All three tabs (Payment History, Subscription Schedules, Upcoming Payments) now work correctly with proper data display.
- **Payment Discount Architecture**: Removed all hardcoded payment discounts from payment flows (CartCheckout, ClassPaymentPlans, PaymentPlanPage, BillingPage) - all discounts now exclusively managed through the database discount system
- **Student Management System**: Added comprehensive system for tracking students across schools with automatic school_student record creation when enrollments reach 'enrolled' or 'completed' status
- **Notification System**: Implemented in-app notification system with PostgreSQL storage, automatic data seeding, real-time unread count badge, and mark-as-read functionality
- **Authentication Migration**: Completed full migration to Supabase-only authentication with proper error handling for existing accounts
- **Welcome Email System**: Added automated welcome emails for new registrants with professional HTML design and role-aware messaging
- **Password Reset System**: Fixed critical UUID bug and implemented dual-database password synchronization with comprehensive error logging

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience with a modern web application architecture, featuring role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive, and responsive design (mobile-first approach).
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Supabase-only authentication using `supabaseAuth` middleware.

### Authentication Standards
**CRITICAL**: The platform has fully migrated to Supabase-only authentication. All new API endpoints MUST follow these guidelines:

1. **Middleware Standard**: Use `supabaseAuth` middleware from `server/middleware/supabase-auth.ts` for ALL new protected endpoints
2. **No Auth0**: Never use `jwtCheck` or any Auth0 middleware (`auth0-auth.ts`) - this is legacy code being phased out
3. **User Identification**: Extract user email from `req.user.email` after `supabaseAuth` middleware runs
4. **Migration Path**: Existing endpoints using `jwtCheck` should be migrated to `supabaseAuth` when updated
5. **Consistency**: All payment, billing, and user-facing endpoints use Supabase authentication exclusively

### Currency Formatting Standards
**CRITICAL**: All currency values must follow these standardized patterns to ensure consistency across the platform:

1. **Backend Storage & API**: Always store and send amounts as **raw cents (numbers)**
   - Database: Store amounts as integers (cents)
   - API Responses: Send amounts as numbers (e.g., `90000` for $900.00)
   - Never send pre-formatted strings from the backend (e.g., "$900.00")
   - Example: `{ amount: 90000, currency: "usd" }`

2. **Frontend Display**: Always format amounts using `CurrencyUtils` helpers from `shared/currency-utils.ts`
   - For display: `CurrencyUtils.format(cents)` → `"$900.00"`
   - For calculations: `CurrencyUtils.toDisplay(cents)` → `900.00` (number)
   - For user input: `CurrencyUtils.parseInput(input)` → cents (number)
   - Never perform raw math on formatted strings

3. **Rationale**: Backend sends raw cents (numbers) for flexibility - frontend can format differently for different contexts (tables, forms, charts). This prevents NaN errors when UI components attempt calculations on pre-formatted strings.

4. **Migration**: All new payment/billing endpoints follow this standard (November 2024). Legacy endpoints should be updated when modified.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system routing operations between persistent database storage and in-memory storage.

### Key Features and Implementations
- **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. All user creation flows (registration, account invite, admin user creation) create Supabase authentication accounts and link them via `supabaseId`. Login authenticates via Supabase `signInWithPassword`.
- **School Branding System**: Allows school administrators to upload and display school logos.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
- **Discount Systems**: Free After Threshold Discount System configurable by school administrators, with automatic suppression of other discounts.
- **Enrollment Management**: Robust system preventing duplicate enrollments, managing a clear status workflow (pending_payment, enrolled, waitlist, cancelled, completed, withdrawn, failed), and integrated with the cart-to-checkout flow. Includes a cart clearing system.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation and foreign key constraint validation on deletion.
- **Registration Flow**: Two-tier registration system with school code validation and robust duplicate prevention across PostgreSQL and Supabase, ensuring atomic school association with full rollback on failure. Creates both Supabase auth account and local database record with linked `supabaseId`.
- **Authentication Migration Utility**: `/api/admin-users/users/migrate-to-supabase` endpoint to batch-create Supabase accounts for existing users without `supabaseId`, with intelligent handling of existing accounts to enable convergence from hybrid authentication state.
- **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, dynamic position management, and intelligent status detection with batched pending invitation checks.
- **User Account Management**: School administrators can send account invites and password reset emails. Account invite system now creates Supabase accounts for users without `supabaseId`, with intelligent handling of existing Supabase accounts via error code detection (`email_exists`).
- **Password Reset System**: Email-based password reset with cryptographically secure token generation (crypto.randomBytes), Supabase UUID-based authentication, dual-database password synchronization, and comprehensive error logging. Fixed critical bug where local database IDs were incorrectly used instead of Supabase UUIDs, which caused 500 errors during password updates.
- **Welcome Email System**: Automated welcome emails sent to new registrants after successful account creation, featuring professional HTML design, login link, and role-aware messaging. Uses BREVO_SENDER_EMAIL for sender address with graceful error handling that doesn't block registration.
- **Parent Profile Management**: Parent users can update their profile information.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details with route-based navigation.
- **Edit Child Profile Page**: Dedicated page for editing child profiles using the ParentAppShell component.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages.
- **Student Management System**: Comprehensive system for tracking and displaying students across schools. Features auto-sync functionality for backfilling existing children into `school_students` table, and automatic school_student record creation when enrollments reach 'enrolled' or 'completed' status. Uses optimized `getSchoolStudentByChildAndSchool` storage method to prevent full-table scans. Auto-creation is scoped by both childId and schoolId to support multi-school scenarios, with graceful error handling that doesn't block enrollment mutations.
- **Notification System**: In-app notification system with PostgreSQL storage, automatic data seeding from JSON files at server startup using transactional upserts, real-time unread count badge on bell icon, optimistic UI updates via React Query cache invalidation, and mark-as-read functionality that updates notification recipients with accurate status tracking.
- **Enrollment Count Display**: Class enrollment counts correctly filter by valid statuses ('enrolled', 'completed') only, excluding invalid 'confirmed' status that doesn't exist in schema.

## External Dependencies
- **Auth0**: Authentication provider.
- **Anthropic Claude API**: AI content generation and analysis.
- **Stability AI**: Image generation.
- **Hugging Face Inference API**: Text processing and analysis.
- **Supabase**: PostgreSQL database and OAuth.
- **Shadcn/ui**: React component library.
- **Tailwind CSS**: CSS framework.
- **Vite**: Build tool.
- **Stripe**: Payment processing.
- **Brevo SMTP**: Email service.
- **SendGrid**: Email service.
- **Twilio**: SMS service.