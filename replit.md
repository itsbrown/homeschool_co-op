# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform provides personalized learning paths, efficient administrative tools, and aims to deliver an adaptive, secure, and user-friendly learning environment for diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience with a modern web application architecture. Key features include role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive, and responsive design (mobile-first approach with breakpoint-specific layouts).
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system routing operations between persistent database storage and in-memory storage.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control and JWT validation. Includes multi-tenant security with strict school boundary validation and an auto-sync mechanism for user metadata derived from the database. A phased migration strategy is in place for metadata management.
- **School Branding System**: Allows school administrators to upload and display school logos consistently across all user interfaces, with fallback behavior.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system featuring subscription schedules, webhooks, smart cart logic, and automated refund processing.
- **Free After Threshold Discount System**: Configurable by school administrators, offering free enrollments for additional children beyond a set threshold, with automatic suppression of other discounts to prevent stacking.
- **Enrollment Lifecycle & Duplicate Prevention**: Robust system preventing duplicate enrollments, managing a clear status workflow (pending_payment, enrolled, waitlist, cancelled, completed, withdrawn, failed), and integrating with the cart-to-checkout flow.
- **Cart Clearing System**: Allows users to clear their shopping cart, properly cancelling `pending_payment` enrollments in the database for audit trails, with strict ownership validation.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation. Class deletion includes foreign key constraint validation to prevent deletion when enrollments, discount applications, daily flow entries, or schedules exist, providing clear error messages.
- **Registration Flow**: Two-tier registration system with school code validation. The `/register` route requires users to enter a valid school registration code before accessing the school-specific registration page at `/register/{code}`. This ensures all registrations are properly associated with schools. Includes robust duplicate prevention checking both PostgreSQL and Supabase auth before account creation, fail-safe error handling that stops registration if uniqueness verification fails, and atomic school association with full rollback (Supabase + database) if the association step fails. Prevents orphaned accounts and ensures data integrity.
- **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management. Features intelligent status detection with batched pending invitation checks - staff members with unaccepted invitations display "Pending" status with a "Resend Invite" option, automatically switching to "Active"/"Inactive" based on isActive flag once invitations are accepted or expired. Uses efficient batch queries (inArray with Map-based lookup) to avoid N+1 performance issues. Database schema includes `is_active` column in role_invitations table and renamed `used_at` column (formerly `used`) for clarity. Date comparisons in Drizzle ORM use the `gt()` operator for database-agnostic queries.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Parent Profile Management**: Parent users can update their profile information via a settings page, with changes persisted to the PostgreSQL database.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details, replacing legacy dialogs with route-based navigation and consistent UI.
- **Edit Child Profile Page**: Dedicated page for editing child profiles using the ParentAppShell component for consistent navigation and layout.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages, adapting layouts, filters, and action buttons for optimal display on different devices.
- **Student Management System**: Comprehensive system for tracking and displaying students across schools. Children are stored in the `children` table and linked to schools via the `school_students` table. When children are registered, corresponding school_student records are automatically created. The Students page features auto-sync functionality that automatically backfills existing children into the school_students table when no students are found, ensuring seamless data migration and display.

### Environment Variables
- **CLIENT_URL**: Required for production to ensure correct email link generation for staff invites, password resets, and account invitations.

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

## Recent Changes

### November 12, 2025
#### Fixed Staff Profile Page Loading Error
- **Issue**: Staff/Admin/Educator profile pages were failing to load with React error #31 (rendering object instead of string)
- **Root Cause**: Missing GET `/api/school-admin/users/:userId` endpoint - frontend was receiving HTML error page instead of JSON
- **Solution**: 
  - Created new GET endpoint `/api/school-admin/users/:userId` with proper authentication and school ownership validation
  - Removed custom queryFn from profile pages (StaffProfilePage, AdminProfilePage, EducatorProfilePage) to use default authenticated fetcher
  - Added robust validation for numeric user IDs with Number.isInteger check
  - Implemented proper school boundary validation to prevent cross-school data access
  - Added support for both firstName/lastName fields and legacy name field splitting
- **Security**: Endpoint enforces strict school ownership validation - admins can only view users from their own school
- **Files Modified**: 
  - `server/api/school-admin.ts` (added GET /users/:userId endpoint)
  - `client/src/pages/schools/StaffProfilePage.tsx` (removed custom queryFn)
  - `client/src/pages/schools/AdminProfilePage.tsx` (removed custom queryFn)
  - `client/src/pages/schools/EducatorProfilePage.tsx` (removed custom queryFn)

#### Sibling Discount Fix
- **Issue**: Sibling discounts were being double-counted in cart ($450 instead of $180)
- **Root Cause**: Both manual calculation AND automatic discount system were applying sibling discounts simultaneously
- **Solution**: Filter out sibling discounts from `fetchApplicableDiscounts` to prevent double-counting, as CartContext.tsx handles sibling calculations directly
- **Files Modified**: `client/src/contexts/CartContext.tsx`

#### Discount Data Migration
- **Action**: Migrated discount data from JSON file to PostgreSQL database
- **Tool**: Created `server/migrate-discounts.ts` migration script
- **Status**: Successfully migrated all discounts to database

#### Fixed Marketing Links Sidebar Navigation
- **Issue**: Marketing Links page was using a different sidebar template than other school admin pages
- **Root Cause**: MarketingLinksPage was using `AppShell` instead of `SchoolAdminLayout`
- **Solution**: Updated MarketingLinksPage to use `SchoolAdminLayout` for consistent navigation
- **Files Modified**: `client/src/pages/MarketingLinksPage.tsx`

#### Fixed Manual Payment Entry Page
- **Issue**: Manual Payment Entry page was showing "h.map is not a function" error
- **Root Cause**: 
  1. Page had no layout component (missing SchoolAdminLayout)
  2. Custom queryFn calls were bypassing default authenticated fetcher
  3. When API returned errors, .map() was called on non-array data
- **Solution**: 
  1. Added `SchoolAdminLayout` for consistent navigation
  2. Removed custom queryFn from all queries to use default authenticated fetcher
  3. Added proper array checks and type safety for data handling
- **Files Modified**: `client/src/pages/ManualPaymentEntryPage.tsx`

#### Fixed School Admin Dashboard Financial Metrics
- **Issue**: Dashboard showing $0 for Monthly Revenue, Total Revenue, and Outstanding Balance even though payments were made
- **Root Cause**: Financial metrics endpoint was filtering for `status === 'succeeded'`, but when Stripe payments are saved to the database, the 'succeeded' status gets converted to 'completed'
- **Solution**: Updated the payment filter to check for both 'completed' and 'succeeded' statuses: `p.status === 'completed' || p.status === 'succeeded'`
- **Files Modified**: `server/api/school-admin.ts` (financial metrics endpoint)
- **Impact**: Dashboard now correctly displays revenue from completed payments