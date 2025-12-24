# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It provides a comprehensive educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to deliver personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Development Checklist

### Pre-Development (Before Writing Code)
1. **Check LSP errors** - Fix any existing diagnostics in affected files before adding new code
2. **Read related files** - Study existing patterns in similar components/routes/storage methods
3. **Trace the data flow** - Map the path: schema → storage → API → frontend
4. **Identify reusables** - Look for existing components, utilities, and hooks before creating new ones
5. **Verify types** - Ensure schema types in `shared/schema.ts` support the new feature

### During Development
1. **Follow existing patterns** - Match naming conventions, error handling, and code style
2. **Build incrementally** - Complete one piece, verify it works, then add the next
3. **Use proper typing** - Leverage Zod validation at API boundaries

### Post-Development (Before Marking Complete)
1. **Run architect review** - Use `include_git_diff: true` to review all changes
2. **Run end-to-end tests** - Use testing tool for user-facing changes
3. **Verify no regressions** - Check that related functionality still works
4. **Clean up** - Remove any debugging code, console.logs, or commented-out code
5. **Update documentation** - Add any new architectural decisions to this file

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
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. OAuth registration is blocked for users without prior school registration.
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, and payment reminders. **SECURITY (Dec 2025)**: Server-side authoritative pricing - all payment amounts are calculated from database lookups, never trusted from client. Includes strict validation for class prices (variant-aware), membership fees (discount-aware), and unified validation blocking any total mismatch.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management and race condition prevention.
-   **Discount Systems**: Database-managed Free After Threshold Discount System.
-   **Free Enrollment Admin Approval**: Enrollments resulting in a $0 total require admin approval.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows, and integrates with the cart-to-checkout flow.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **Registration Flow**: Two-tier registration with school code validation and transactional role creation.
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
-   **Interactive Onboarding Tour**: Custom-built guided tour for new parent accounts.
-   **Subscription Status Toggle**: School admin-configurable toggle to control subscription status display during checkout.
-   **AI Smart Tutorial System**: Conversational AI guidance using Anthropic Claude that provides context-aware help to parents. Features rate limiting, conversation truncation, dynamic UI element highlighting, and page-specific suggestions.
-   **System Error Monitoring**: Comprehensive error tracking and notification system with database logging, severity levels (low/medium/high/critical), automatic email notifications for critical errors, daily summary emails at 8 AM, React Error Boundary for frontend errors, Express error middleware for backend errors, and admin dashboard at /admin/system-errors for viewing/filtering/resolving errors. Email notifications sent to errors@americanseekersacademy.com.

### Educator Dashboard
The Educator Dashboard provides educators/mentors with tools to manage their classes, track attendance, view lesson plans, and log their work hours. It integrates with the existing Daily Flow system for lesson planning.

**Completed Features:**
- Educator Session MVP (view classes, start/end sessions, daily flow integration)
- Admin Tools & Planning (manage schedules, audit trail, weekly calendar, my hours)
- Session Attendance Tracking UI (mark students present/absent/late/excused, bulk actions, notes)

**Planned Features:**
- Class-specific parent messaging with admin approval
- Notification system for educators
- Academic features (gradebook, resource sharing)
- Scheduling & Integration (calendar, alerts)
- Analytics & Security (dashboards, 2FA, compliance)

## External Dependencies
-   **Supabase**: Authentication (OAuth).
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