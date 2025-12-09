# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application designed for the American Seekers Academy. It offers a comprehensive and engaging educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Debugging Guidelines
- **Trace the entire request flow from endpoint to database before making fixes**, not just the layer where the problem appears to be. Follow the code path through: API route → storage interface → actual storage implementation (database or memory) to ensure all layers are using the correct data source.
- **HybridStorage architecture**: `dbStorage` can be either DatabaseStorage or MemStorage (fallback). Use identity comparison (`this.dbStorage !== this.memStorage`) to detect real database availability.
- **Watch for duplicate storage mechanisms**: Some API files may have their own in-memory Maps or caches that bypass the central storage system entirely. Check for module-level variables in API route files.
- **Invitation-related bugs**: For any staff/role invitation issues, see **ARCHITECTURAL_PATTERNS.md Section 8** (Token-based Invitation Flow). Key rules: reuse tokens on resend (don't generate new), use public endpoints for unauthenticated access, and consolidate to role_invitations table.
- **Parent profile access for OAuth users**: Parent role check now uses user_roles table (multi-role compatible) with fallback to legacy users.role column. "Orphaned" OAuth parents (schoolId=null, logged in without registration) can be viewed by any school admin to facilitate account association.

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
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. **OAuth Registration Blocker**: Users attempting Google OAuth login without prior school registration are blocked with a friendly error message redirecting them to contact their school administrator. This prevents orphaned accounts (schoolId=null) from being created. Existing registered users continue normal login flow.
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching capabilities. Role management uses a centralized three-way access control helper (`checkSchoolAdminAccessToUser`) for consistent security. RoleSwitcher updates immediately via TanStack Query cache invalidation when roles are added/removed.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, and automatic payment reminders.
-   **Payment Reminder System**: Automated email reminders for scheduled payments at T-7, T-3, T-1, T+0 (due day), and T+1 (overdue) days. Uses Brevo SMTP for delivery.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management, race condition prevention, and atomic bulk cancellation.
-   **Discount Systems**: Database-managed Free After Threshold Discount System.
-   **Free Enrollment Admin Approval**: When a 100% discount results in a $0 total, enrollments require admin approval as a safeguard against abuse. Parents see a "Request Free Enrollment" UI, admins receive notifications, and can approve/reject via admin dashboard. Approved enrollments become active immediately; parents are notified of decisions.
-   **Enrollment Management**: Prevents duplicate enrollments, manages status workflows (including pending_admin_approval status), and integrates with the cart-to-checkout flow.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing and school isolation.
-   **Registration Flow**: Two-tier registration with school code validation. Role creation is transactional - user_roles and activeRoleId are created atomically before registration completes. Frontend RoleContext includes defensive retry mechanism (max 3 attempts, 1.5s delay) for edge cases.
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
-   **Interactive Onboarding Tour**: Custom-built guided tour for new parent accounts explaining dashboard features, enrollment workflow, and emphasizing that children are only enrolled after first payment. School admins can toggle this feature on/off.
-   **Subscription Status Toggle**: School admin-configurable toggle in School Settings → Checkout Settings to control whether subscription status is displayed during checkout. Defaults to OFF to prevent potential date parsing errors when subscription data is unavailable.

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

## Educator Dashboard Roadmap

### Overview
The Educator Dashboard provides educators/mentors with tools to manage their classes, track attendance, view lesson plans, and log their work hours. It integrates with the existing Daily Flow system for lesson planning.

### Phase 1a: Educator Session MVP (Completed)
**Goal**: Educator can view their assigned classes, see today's lessons, and start/end class sessions.

**Database Tables**:
- `class_sessions` - Tracks individual class session instances with check-in/out times
- `educator_class_assignments` - Links educators to classes with permissions

**Features**:
- Educator Dashboard home page with today's classes (`/educator`)
- My Classes list showing all assigned classes (`/educator/my-classes`)
- Active Session view with start/end class functionality (`/educator/session/:id`)
- Daily flow integration (lesson links, materials, objectives)
- Role-based access control via `requireEducatorRole` middleware
- Error boundaries and loading/error/empty states
- API routes: GET /api/educator/dashboard, /my-classes, /sessions, /active-session
- Session management: POST /api/educator/sessions/:id/start, /end, /cancel

**Status**: Completed

### Phase 1b: Admin Tools & Planning (Completed)
**Goal**: Admin can manage educator schedules, full audit trail, educator can plan ahead.

**Database Tables**:
- `educator_schedules` - Admin-set time blocks per class (recurring weekly or one-time)
- `audit_logs` - Comprehensive audit trail with actor, target, metadata, and severity levels

**Features**:
- Weekly Calendar view for planning ahead (`/educator/weekly-calendar`)
- My Hours page with logged sessions summary and weekly totals (`/educator/my-hours`)
- Admin Educator Management page with schedule creation (`/schools/educators`)
- Admin Educator Profile view for schedule and assignment management (`/schools/educators/:id`)
- Full audit logging on session start/end/cancel actions
- Quick action links on Educator Dashboard
- API routes: GET /api/admin/educators, GET /api/admin/educators/:id
- Schedule management: POST /api/admin/educators/schedules, DELETE /api/admin/educators/schedules/:id
- Educator hours API: GET /api/educator/my-hours with date range filtering

**Status**: Completed

### Phase 2: Communication & Attendance
**Features**:
- Attendance tracking (present/absent/tardy)
- Class-specific parent messaging with admin approval workflow
- Notification system for educators
- Audit trail for all messages

**Status**: Planned

### Phase 3: Academic Features
**Features**:
- Assignment/Gradebook system
- Document/Resource sharing per class
- Session feedback mechanism (educator → admin → parents)

**Status**: Planned

### Phase 4: Scheduling & Integration
**Features**:
- Parent-teacher conference scheduling
- Calendar integration (Google/Outlook)
- Emergency alerts system
- Substitute staff management

**Status**: Planned

### Phase 5: Analytics & Security
**Features**:
- Analytics dashboard (attendance trends, engagement)
- Two-factor authentication for staff
- GDPR/FERPA compliance controls
- Exportable reports

**Status**: Planned