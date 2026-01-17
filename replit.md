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
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, payment reminders, and server-side authoritative pricing.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management and race condition prevention, including server-side authoritative discount calculations.
-   **Discount Systems**: Database-managed comprehensive discount system supporting 19+ discount types with various application methods and eligibility filters.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows, and integrates with cart-to-checkout.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **AI Enrollment Assistant**: Provides personalized AI guidance.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **AI Smart Tutorial System**: Conversational AI guidance using Anthropic Claude with context-aware help, rate limiting, conversation truncation, dynamic UI element highlighting, and page-specific suggestions.
-   **System Error Monitoring**: Comprehensive error tracking and notification system with database logging, severity levels, automatic email notifications for critical errors, and an admin dashboard.
-   **Unified Credit System**: Extensible multi-type credit system supporting volunteer, referral, achievement, marketing, and manual credits, with admin approval, FIFO consumption, and an expiration service.
-   **Fundraiser System**: Complete fundraiser management for schools to run product-based campaigns, including database schema, school admin UI, public storefront, parent dashboard, and credit integration.
-   **Refund Management System**: Comprehensive refund processing with pro-rated calculator, structured reason codes, refund history page, analytics dashboard, and policy display on checkout.
-   **Payment Reminder Tracking System**: Comprehensive audit logging for all payment reminders (automatic and manual) with school admin visibility, manual reminder send capabilities, and "Group by Parent" view.

### Payment Reminder Tracking System
Complete payment reminder audit logging and manual send capabilities for school administrators:

**Database Schema:**
-   `payment_reminder_logs` table tracks all reminders with: schoolId, scheduledPaymentId, parentEmail, parentName, childName, className, amountCents, reminderType, status, isManual, sentBy, errorMessage, sentAt

**Reminder Types:**
-   `7_days_before`, `3_days_before`, `1_day_before`, `due_today`, `1_day_overdue`, `7_days_overdue`, `manual`, `summary`

**Components:**
-   Reminders tab in `FinancialReportsPage` - View all sent/failed reminders with status badges
-   "Send Reminder" button on Outstanding Balances rows - Manual reminder with loading state
-   "Send Summary" button in grouped parent view header - Sends consolidated email with all outstanding payments for that parent
-   "Group by Parent" toggle - Consolidates balances by parent email, shows phone numbers for quick contact

**API Endpoints:**
-   `GET /api/admin/financial-reports/reminder-history` - Fetch reminder logs for school
-   `POST /api/admin/financial-reports/send-reminder` - Send manual reminder for single payment
-   `POST /api/admin/financial-reports/send-summary-reminder` - Send consolidated summary email with all outstanding payments for a parent

**Email Templates:**
-   `sendScheduledPaymentReminder` - Single payment reminder with due date and amount
-   `sendConsolidatedPaymentReminder` - Summary email with HTML table of all outstanding payments, overdue highlighting, and total amount

**Security:**
-   All endpoints use `getSchoolAdminWithFeatureCheck` for auth + feature gating
-   Manual reminders validate scheduled payment belongs to admin's school via enrollment.schoolId
-   Summary reminders query only payments WHERE scheduledPayments.schoolId = adminSchoolId, preventing cross-tenant data leakage

### Refund System
Complete refund management for school administrators:

**Components:**
-   `RefundDialog` (`client/src/components/payments/RefundDialog.tsx`) - Issue refunds with structured reason dropdown, pro-rated calculator display, and confirmation workflow
-   `RefundHistoryPage` (`client/src/pages/schooladmin/RefundHistoryPage.tsx`) - View all refunds with search, filters, CSV export, and analytics cards
-   `RefundPolicyNotice` (`client/src/components/checkout/RefundPolicyNotice.tsx`) - Display refund policy on checkout pages
-   `refundCalculator` (`client/src/lib/refundCalculator.ts`) - Pro-rated refund calculation based on program dates

**Pro-rated Refund Logic:**
-   Before program start: Full refund available
-   During program: Pro-rated based on remaining days (daysRemaining / totalDays)
-   After program end: No refund available

**Refund Reason Codes:**
-   `duplicate_charge`, `program_cancelled`, `customer_request`, `sibling_adjustment`, `billing_error`, `service_issue`, `withdrawal`, `other`

**API Endpoints:**
-   `GET /api/admin/refunds` - Fetch refund history with school isolation and enriched enrollment/payment data
-   `POST /api/admin/enrollments/:id/reallocate-payment` with `targetType='refund'` - Process refunds

### Educator Dashboard
Provides educators/mentors with tools to manage classes, track attendance, view lesson plans, and log work hours. It integrates with the Daily Flow system and features a dedicated `EducatorAppShell` with role-specific routing.

### Unified File Upload System
Production-grade file upload system using Replit App Storage (Object Storage) for secure, scalable file handling.

**Architecture:**
-   **Backend Service**: `server/services/fileUploadService.ts` - Category-based validation, presigned URLs, direct buffer uploads
-   **API Endpoints**: `server/api/unified-uploads.ts` - REST endpoints for upload URL generation and file management
-   **Frontend Client**: `client/src/lib/uploadClient.ts` - Progress tracking, error handling, typed API wrapper
-   **Object Storage**: Replit App Storage for production-grade persistence across deployments

**Supported Upload Categories:**
-   `signatures` - Digital signature images from waiver signing (private, 1MB max, PNG/JPEG)
-   `logos` - School branding logos (public, 2MB max, images)
-   `documents` - School documents and waivers (private, 10MB max, PDF/Word/images)
-   `knowledge-base` - Course materials and attachments (private, 50MB max, various formats)
-   `fundraiser-products` - Product images for fundraiser campaigns (public, 5MB max, images)
-   `assessments` - Assessment attachments and submissions (private, 20MB max, various formats)
-   `profile-photos` - User profile pictures (public, 2MB max, images)

**Adding New Upload Categories:**
1. Add config entry to `uploadCategories` in `server/services/fileUploadService.ts`:
   ```typescript
   'new-category': {
     folder: 'new-category',
     allowedTypes: ['image/png', 'application/pdf'],
     maxSizeBytes: 5 * 1024 * 1024,
     public: false,
   }
   ```
2. No additional code changes needed - validation, paths, and URLs are auto-configured

**Usage Patterns:**
-   **Frontend (Uppy)**: Use `ObjectUploader` component for drag-and-drop uploads with progress
-   **Server-side**: Use `fileUploadService.uploadBuffer()` for programmatic uploads (e.g., signature images)
-   **Signed URLs**: Use `fileUploadService.getUploadUrl()` for client-side direct uploads

## External Dependencies
-   **Supabase**: Authentication.
-   **Replit App Storage**: Object storage for file uploads (signatures, logos, documents, media).
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

## Future Improvements

### Server-Authoritative Pricing (High Priority)
**Problem:** Client-side discount calculations duplicate server logic, causing payment mismatches when rules change.

**Solution:** Make the server the single source of truth for all pricing:
1. Create `/api/cart/calculate` endpoint returning complete pricing breakdown
2. Update CartContext to fetch prices from server instead of calculating locally
3. Remove duplicate discount logic from frontend
4. Add E2E tests for discount combinations (sibling + promo, free-after-threshold, etc.)

**Impact:** Eliminates TOTAL_MISMATCH payment errors permanently.