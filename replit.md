# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, designed to serve parents, educators, school administrators, and students. It integrates full-stack web architecture with AI-powered content generation and educational assessment tools to provide a comprehensive and engaging educational experience. The platform aims to offer robust educational support, personalized learning paths, and efficient administrative tools for various user roles.

## User Preferences
Preferred communication style: Simple, everyday language.

## Testing Requirements (CRITICAL)
**MANDATORY: Always test the UI before marking any task complete.**
- Backend API testing alone is insufficient
- All user-facing features must be verified through the actual UI
- Use the `run_test` tool for automated e2e testing when applicable
- Manual UI verification is required when automated testing isn't possible
- Testing only the backend and assuming the UI works is not acceptable
- Schema changes must be verified across the entire database, not just specific tables

## System Architecture
### Core Design Principles
The platform follows a modern web application architecture, emphasizing scalability, security, and a rich user experience. It incorporates role-based access control, AI-driven content generation, and a comprehensive payment system.

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Library**: Shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **State Management**: React hooks and context
- **Authentication**: Auth0 integration
- **UI/UX Decisions**: Focus on a professional and intuitive user experience with clear navigation, dynamic updates, and consistent design. Features include consolidated navigation, simplified page structures, robust data handling, and clear payment plan selections.

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API
- **File Handling**: Multer
- **Authentication Middleware**: Auth0 JWT validation

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data including enrollments, payments, and financial tracking
- **Financial Data Migration (October 2025)**: All enrollment and payment data migrated from JSON files to PostgreSQL database with ACID transaction support
  - **program_enrollments table**: Stores all program enrollments with payment tracking (total_cost, total_paid, remaining_balance, payment_status)
  - **payments table**: Records all payment transactions (Stripe and manual) with schoolId, parentId, enrollmentIds, and descriptions
  - **scheduled_payments table**: Tracks payment plans and installments
  - **refunds table**: Records refund transactions
  - **Legacy JSON files**: Archived in `data/archive_legacy_json/` (enrollments.json, payment-history.json, scheduled-payments.json)
- **Database Connection**: URL-encoded connection string builder (`server/lib/database-url.ts`) to properly handle special characters in credentials for both runtime and drizzle-kit operations
- **File Storage**: Local filesystem for general files, file-based system for knowledge bases
- **Authentication Integration**: Frontend authenticates via Supabase OAuth, backend queries Supabase database directly for user/school data (as of October 2025)

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, school_admin, platform_admin) and JWT validation. Includes custom form builder security hardening with ownership and cross-tenant checks.
- **Admin Payment Plan Editing (October 2025)**: School administrators can modify payment plans for existing enrollments through a dedicated admin UI. Features include:
  - **Admin Enrollment Management Page** (`/schools/enrollments`): Table view of all enrollments with payment details, search, and filtering
  - **Payment Plan Editor**: Interactive dialog for changing payment frequency (one_time, weekly, biweekly, monthly) with real-time preview of new schedules
  - **Validation**: Prevents invalid changes (program ended, fully paid, insufficient time for installments)
  - **Audit Trail**: All changes logged in enrollment metadata with admin email, timestamp, old/new frequency, and justification comment
  - **Stripe Integration**: System records manual review flag for subscription schedule updates (Stripe API requires manual approval for phase modifications)
  - **Security**: Role-based access (school_admin only), school-level data isolation, authentication on all endpoints
  - **Technical Implementation**: Backend APIs (`PATCH/GET /api/admin/enrollments/:id/payment-plan`), frontend UI with TanStack Query, uses payment calculator for schedule recalculation
- **Enhanced Payment System**: Comprehensive Stripe-only payment system with subscription schedules, webhook integration, and smart cart logic to manage enrollments and prevent duplicates. Supports various payment statuses and plans.
- **Date-Driven Payment Plans (October 2025)**: Flexible payment frequency system that calculates installment schedules based on actual program dates rather than fixed payment counts. Parents can choose weekly, biweekly, or monthly payment frequencies for installment plans. The system automatically calculates payment amounts and dates between the program start and end dates, ensuring the final payment aligns with the program end date. Implementation includes:
  - **Database Schema**: Added `payment_frequency`, `program_start_date`, and `program_end_date` columns to `program_enrollments` table
  - **Payment Calculator** (`server/lib/payment-calculator.ts`): Computes installment schedules based on class duration and selected frequency, enforces minimum 2 installments, handles rounding to ensure total consistency
  - **Stripe Integration**: Enrollment creation copies class dates, payment service uses date-based calculator when frequency and dates are provided, maintains legacy fallback for older enrollments
  - **Checkout UI Payment Plans**: 
    - **Pay in Full**: Single one-time payment for the entire amount
    - **50% Deposit**: 50% upfront deposit with remaining balance due later
    - **Split Payment Plan**: Allows parents to choose payment frequency (Weekly/Biweekly/Monthly) with date-based installment calculation
    - **Biweekly Payment Plan**: Fixed biweekly payment frequency with automatic date-based installment calculation (replaced Monthly Plan in October 2025)
  - **Payment Frequency Automation**: Frontend automatically sets payment frequency based on selected plan (biweekly plan → 'biweekly', full/deposit → 'one_time', split → user choice)
- **Automated Refund Processing**: School administrators can process full or partial refunds directly from the admin panel. The system automatically processes Stripe refunds via API for Stripe payments and creates internal refund records for manual payments. Webhook handlers (`charge.refunded`) sync Stripe refunds with internal records, with idempotency checks to prevent duplicate processing. Refunds are distributed proportionally across all affected enrollments, updating balances and statuses correctly.
- **Complete Registration Flow**: Automated account creation with user-provided passwords, handling of existing accounts, and seamless auto-login.
- **AI Enrollment Assistant**: Personalized AI assistant providing enrollment guidance based on user authentication metadata.
- **Staff Management & Invitation System**: Automated staff onboarding with secure token-based invitations, Supabase account creation, temporary passwords, and professional email notifications. Dynamic staff position management and comprehensive editing with data persistence. Staff data is migrated to the production database.
- **User Account Management**: School administrators can send account invites and password reset emails to users.
- **Password Reset System**: Fully functional email-based password reset with persistent token storage and secure updates.
- **Email Service**: Dual email service integration (Brevo SMTP and SendGrid) for various notifications and account management features, utilizing professional email templates.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis and generation (coloring pages, worksheets, lesson plans).
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis and curriculum generation, Stability AI for image generation, and Hugging Face for text processing.
- **Educational Tools**: Generators for professional coloring pages and various educational activities, curriculum/lesson plan creation, and student work analysis.
- **Data Flow**: Secure user authentication, AI-driven content processing post-upload, activity generation, role-based content access, and persistence in Supabase.

### Planned Features
- **School Subscription Tiers**: A tiered subscription system for schools (Basic, Pro, Enterprise) for premium features, implemented with database schema additions, feature gate infrastructure, and Stripe integration.
- **Role Naming Convention Standardization**: Standardize all role names to camelCase (`schoolAdmin`) across the application, involving database mapping, backend and frontend cleanup, and comprehensive testing.

## External Dependencies
- **Auth0**: Primary authentication provider.
- **Anthropic Claude API**: For AI content generation and analysis.
- **Stability AI**: For image generation.
- **Hugging Face Inference API**: For text processing and analysis.
- **Supabase**: PostgreSQL database with real-time capabilities.
- **Shadcn/ui**: React component library for UI.
- **Tailwind CSS**: Utility-first CSS framework.
- **Vite**: Build tool and development server.
- **Stripe**: Payment processing for subscriptions and enrollments.
- **Brevo SMTP**: Email service for notifications.
- **SendGrid**: Email service for account management features.
- **Twilio**: SMS service for notifications.