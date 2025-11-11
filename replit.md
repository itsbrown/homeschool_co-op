# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, providing a comprehensive and engaging educational experience. It integrates full-stack web architecture with AI-powered content generation and assessment tools to offer robust educational support, personalized learning paths, and efficient administrative tools for all users. The platform aims to deliver an adaptive, secure, and user-friendly learning environment catering to diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform utilizes a modern web application architecture prioritizing scalability, security, and user experience. It features role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional and intuitive design with consolidated navigation.
- **Responsive Design**: Mobile-first approach with breakpoint-specific layouts:
  - Mobile (<md): Card-based layouts for list views, stacked filters/controls
  - Tablet (md-lg): Optimized table views with responsive columns
  - Desktop (lg+): Full-featured table views with all columns visible
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data (enrollment, payment, financial tracking).
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system (CombinedStorage) routing operations between persistent database storage (dbStorage) and in-memory storage (memStorage) for feature-specific data. Critical data (Classes, Schools, Children, Enrollments, Stripe Subscriptions, etc.) are in PostgreSQL.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, schoolAdmin, admin, superAdmin) and JWT validation. School-admin API endpoints are protected with Supabase JWT authentication.
- **Multi-Tenant Security**: Comprehensive isolation preventing cross-school data leakage, with strict school boundary validation enforced on all school-admin API endpoints using JWT tokens.
- **Security Architecture & Metadata Management**:
  - **Database as Source of Truth**: All user metadata (schoolId, role, name) is derived from the PostgreSQL database, NOT from JWT tokens or user-editable fields
  - **Auto-Sync Mechanism**: Authentication middleware (`server/middleware/supabase-auth.ts`) automatically detects and corrects metadata mismatches on every authenticated request
  - **Tampering Detection**: Enhanced monitoring logs security alerts when metadata doesn't match database values, enabling detection of tampering attempts
  - **Current Implementation (Phase 2 - ACTIVE)**: Hybrid authentication mode supporting both `app_metadata` (new users, admin-only) and `user_metadata` (existing users, with auto-sync)
  - **Phase 2 Features**:
    - New user registrations write role and schoolId to secure `app_metadata` (immutable, admin-only)
    - Middleware checks `app_metadata` first, then falls back to `user_metadata` for existing users
    - Feature flag (`PHASE_2_APP_METADATA_ENABLED`) enables instant rollback to Phase 1 if needed (defaults to enabled)
    - Existing users continue working seamlessly with auto-sync from database
    - Zero downtime migration - no impact on active users
  - **Migration Strategy**: Three-phase approach to migrate from `user_metadata` to `app_metadata` (admin-only, immutable):
    - **Phase 1 (COMPLETED)**: Email notifications for new student registrations, enhanced security monitoring and logging
    - **Phase 2 (ACTIVE)**: New user signups write to `app_metadata`, existing users continue with auto-sync fallback
    - **Phase 3 (Future)**: Gradual batch migration of existing users to `app_metadata` during controlled maintenance windows
  - **Notification System**: School administrators receive dual-channel notifications (email + in-app) when new students register, with graceful error handling to prevent registration failures
- **School Branding System**: 
  - **Logo Storage**: School logos stored in the `schools.logo` field (text field containing URL/path to image file)
  - **Logo Upload**: School administrators can upload logos via the School Settings page (`/schools/settings`) after school creation
  - **Logo Display**: School logo and name are displayed consistently across all user interfaces:
    - **Parent Interface**: ParentSidebar and ParentAppShell show school logo/name
    - **School Admin Interface**: UnifiedSchoolAdminSidebar displays school logo/name for administrators and educators
    - **Fallback Behavior**: If no logo is uploaded, displays school name only; if no school data available, displays "ASA Platform" as default
  - **Responsive Sizing**: Logo sizes adapt to context (8px height for desktop sidebar, 6px for mobile)
  - **Error Handling**: Images with broken URLs gracefully hide via `onError` handler
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system featuring subscription schedules, webhooks, smart cart logic, date-driven payment plans, and automated refund processing.
- **Free After Threshold Discount System** (Added Nov 11, 2025):
  - **Configuration**: School administrators can enable/disable the feature and set the threshold (default: 3 children) via the Discounts page (`/schools/discounts`)
  - **Formula**: `freeCount = max(0, uniqueChildren - threshold)` - counts UNIQUE children (not total enrollments)
  - **Application**: Makes the cheapest enrollments free based on freeCount (e.g., if threshold=3 and family has 4 children, the cheapest enrollment is free)
  - **Double-Dipping Prevention**: When active (family has more children than threshold), sibling discounts and promo codes are automatically suppressed to prevent stacking discounts
  - **Database Schema**: Added `freeAfterThresholdEnabled` (boolean, default false) and `freeAfterThreshold` (integer, default 3) columns to schools table
  - **Cart Integration**: Cart context tracks free items in `cart.discounts.freeItemIds` array and total discount in `cart.discounts.freeAfterThree`
  - **UI Indicators**: FREE badges (emerald color with Gift icon) and "FREE" text replace prices in both CartDrawer and CartCheckout for free items
  - **Dynamic Messaging**: Cart shows personalized messages based on children count and threshold (e.g., "Amazing! Your 2 cheapest enrollments are FREE!")
  - **API Endpoints**: 
    - GET `/api/school-admin/my-school` - Fetch school settings including threshold configuration
    - PATCH `/api/school-admin/my-school/free-after-threshold` - Update threshold settings (requires school admin JWT authentication)
  - **Security**: All settings modifications require school administrator authentication, settings stored in database (not client-side), multi-tenant isolation enforced
- **Enrollment Lifecycle & Duplicate Prevention** (Updated Nov 11, 2025):
  - **Proper Status Workflow**: Enrollments now follow a clear lifecycle: `pending_payment` (cart) → `enrolled` (after payment) → `completed`/`cancelled`
  - **Database Schema**: Updated program_enrollments status constraint to allow all lifecycle values: `pending_payment`, `enrolled`, `waitlist`, `cancelled`, `completed`, `withdrawn`, `failed`
  - **Migration**: Automatic migration runs on app startup via `server/init-db.ts` to update status CHECK constraint
  - **Duplicate Prevention**: Robust checks prevent creating multiple enrollments for the same child+class combination
  - **Cart-to-Checkout Flow**:
    - Adding to cart creates enrollment with status='pending_payment'
    - Duplicate detection returns existing enrollment instead of creating duplicates
    - Checkout reuses existing pending enrollments rather than creating new ones
    - Stripe webhook updates status to 'enrolled' only after successful payment
  - **Waitlist Handling**: Classes at capacity immediately create waitlist enrollments (status='waitlist') without requiring payment
  - **Implementation**: 
    - `POST /classes/:id/enroll` creates pending enrollments with duplicate checks
    - `POST /stripe/create-payment-intent` finds and reuses existing pending enrollments
    - Stripe webhooks handle status transitions on payment success/failure
  - **Fix Summary**: Eliminated duplicate enrollment bug where enrollments were created both during cart-add AND checkout, and fixed database constraint to allow pending_payment status before payment completion
  - **Cart Clearing System** (Added Nov 11, 2025):
    - **Database Consistency**: When users clear their shopping cart, pending_payment enrollments are properly cancelled in the database (not deleted) to maintain audit trail
    - **Implementation**: POST `/api/cart/clear` endpoint with Auth0 JWT authentication validates ownership and marks enrollments as 'cancelled'
    - **Storage Layer**: `cancelPendingEnrollments(enrollmentIds[], parentUserId)` validates child ownership, skips already-paid enrollments, and returns detailed status
    - **Frontend Flow**: CartContext gathers enrollment IDs from cart items, calls API with auth token, invalidates React Query cache, and only clears local state after successful backend response
    - **Security**: Strict ownership validation ensures parents can only cancel their own children's enrollments
    - **Error Handling**: Partial failures are logged and reported, preventing orphaned enrollments that appear on children page after cart is cleared
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing. All class CRUD operations enforce strict school isolation. Edit form dropdowns (location, instructor, status) properly pre-select existing values when editing.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management. Requires `CLIENT_URL` environment variable set to production domain for correct email links.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Parent Profile Management** (Updated Nov 11, 2025):
  - **Settings Page**: Parent users can update their profile (firstName, lastName, phoneNumber) via the Settings page
  - **Database Persistence**: PATCH `/api/users/profile` endpoint saves changes to PostgreSQL database via storage layer
  - **Implementation**: Endpoint authenticates via Supabase JWT, fetches user by email, validates ownership, updates database with partial updates
  - **Name Field Sync**: Automatically combines firstName + lastName into the `name` field for consistency across the platform
  - **Error Handling**: Comprehensive logging and error handling for debugging profile update failures
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema with 'product' field type supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details (`/parent/classes/:id`) replacing the previous unformatted dialog. Features proper ParentAppShell layout with header/navigation, formatted class information (price, description, dates, capacity, variants), and responsive design. Replaces the legacy viewDetailsDialog pattern with route-based navigation.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across school admin pages (Classes, Students, Staff) with:
  - Desktop: Full table views with all data columns
  - Mobile: Card-based layouts with essential info and dropdown actions
  - Filters: Stack vertically on mobile, row layout on desktop
  - Action buttons: Full-width on mobile, auto-width on desktop

### Environment Variables
- **CLIENT_URL**: Required for production deployment. Must be set to the production domain (e.g., `https://accounts.americanseekersacademy.com`) for correct email link generation (staff invites, password resets, account invitations). Without this, emails will contain incorrect URLs.

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