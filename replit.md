# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Debugging Guidelines
- **Trace the entire request flow from endpoint to database before making fixes**, not just the layer where the problem appears to be. Follow the code path through: API route → storage interface → actual storage implementation (database or memory) to ensure all layers are using the correct data source.
- **HybridStorage architecture**: `dbStorage` can be either DatabaseStorage or MemStorage (fallback). Use identity comparison (`this.dbStorage !== this.memStorage`) to detect real database availability.
- **Watch for duplicate storage mechanisms**: Some API files may have their own in-memory Maps or caches that bypass the central storage system entirely. Check for module-level variables in API route files.
- **Invitation-related bugs**: For any staff/role invitation issues, see **ARCHITECTURAL_PATTERNS.md Section 8** (Token-based Invitation Flow). Key rules: reuse tokens on resend (don't generate new), use public endpoints for unauthenticated access, and consolidate to role_invitations table.
- **Parent profile access for OAuth users**: Parent role check now uses user_roles table (multi-role compatible) with fallback to legacy users.role column. "Orphaned" OAuth parents (schoolId=null, logged in without registration) can be viewed by any school admin to facilitate account association.
- **Dual Enrollment Systems**: The platform has TWO separate enrollment systems that must NOT be confused:
  - `school_class_enrollments` table: Used for **school-specific class management** and future roster features. Links via `studentId` → `school_students` → `children`. Currently not populated by the enrollment flow.
  - `program_enrollments` table: Used for **active class enrollments** including enrollment count, rosters, and cart/checkout flows. Links via `childId` → `children` directly. Use `storage.getAllEnrollments()` or `storage.getEnrollmentCountForClass()`.
  - **Critical**: Class roster endpoints must query `program_enrollments` (same as enrollment count) to show students. The enrollment count and roster must use the same data source.

## Authentication Patterns
When adding or modifying authenticated endpoints, ALWAYS verify BOTH backend and frontend:

### Backend Endpoint Checklist
1. **Middleware chain**: Use `supabaseAuth` + `requireSchoolContext` for school-scoped endpoints
   ```typescript
   router.get('/endpoint', supabaseAuth, requireSchoolContext, async (req: any, res) => {
   ```
2. **School ID access**: Use `req.schoolId` (from middleware), NEVER `req.user?.schoolId` directly
3. **Role access**: Check `req.user?.role || req.user?.activeRole` for multi-role users
4. **Authorization**: Verify user has permission via role check or assignment lookup

### Frontend Caller Checklist
1. **JSON requests**: Use `apiRequest()` from `queryClient.ts` - automatically adds Bearer token
2. **Blob/File downloads**: For raw `fetch` (CSV, files), manually add auth header:
   ```typescript
   const token = localStorage.getItem('supabase_token');
   const response = await fetch('/api/endpoint', {
     headers: {
       ...(token && { 'Authorization': `Bearer ${token}` }),
     },
   });
   ```
3. **Never use cookies-only auth**: `credentials: 'include'` alone is insufficient - always include Bearer token

### Common Auth Mistakes
- Adding backend middleware but forgetting to update frontend caller
- Using `req.user?.schoolId` instead of `req.schoolId` from middleware
- Using raw `fetch` without Authorization header for authenticated endpoints
- Not checking both `role` and `activeRole` for multi-role users

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
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. OAuth registration is blocked for users without prior school registration to prevent orphaned accounts.
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, and payment reminders.
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

### Phase 2: Communication & Attendance (In Progress)
**Goal**: Attendance tracking for class sessions, parent messaging with admin approval, educator notifications.

**Database Tables**:
- `session_attendance` - Tracks student attendance per class session (status: present/absent/late/excused, check-in/out times, notes)

**Completed Features**:
- Session attendance schema with status tracking, check-in/out times, notes, and recorded-by tracking
- Full CRUD API endpoints for attendance management:
  - GET /api/educator/sessions/:sessionId/attendance - Get attendance for a session
  - GET /api/educator/sessions/:sessionId/roster - Get class roster with attendance status
  - POST /api/educator/attendance - Create single attendance record
  - POST /api/educator/attendance/bulk - Bulk create/update attendance records
  - PATCH /api/educator/attendance/:id - Update attendance record
  - DELETE /api/educator/attendance/:id - Delete attendance record
  - GET /api/educator/children/:childId/attendance - Get child's attendance history
- Upsert pattern to prevent duplicate attendance records
- Full audit logging for attendance operations
- Authorization: Educators can only manage attendance for their assigned classes

**Remaining Features**:
- Frontend attendance UI for educators
- Class-specific parent messaging with admin approval workflow
- Notification system for educators
- Audit trail for all messages

**Status**: In Progress (Backend Complete)

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