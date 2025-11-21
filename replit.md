# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It provides a comprehensive and engaging educational experience through full-stack web architecture, AI-powered content generation, and assessment tools. The platform aims to deliver personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
### November 21, 2025
- **CRITICAL FIX: ActiveRoleId Backfill Migration (PRODUCTION-READY)**: Added two production-ready migrations to `server/init-db.ts` that automatically backfill null activeRoleId values for all users. First migration sets activeRoleId to primary role (isPrimary=true) from user_roles table. Second migration provides fallback to earliest role (ORDER BY created_at) for users without primary role. Migrations are idempotent, run automatically on all environment startups, and resolve RoleSwitcher visibility issue for multi-role users. Verified to update 19 affected users successfully.
- **Same-School Role Switching Policy (SECURITY)**: Implemented strict same-school-only role switching to prevent cross-tenant data leakage. Users can only switch between roles at the same school. RoleSwitcher UI filters roles by current schoolId, backend validates and rejects cross-school switches with 403 error, and regression tests ensure security enforcement.
- **Role Switcher UI Enhancement**: Added RoleSwitcher component to Header.tsx, providing visible role status and dropdown menu for switching between available roles at the current school.
- **Smart Cache Invalidation**: Replaced window.location.reload() with targeted React Query cache invalidation, providing smooth role transitions without full page refresh while ensuring data consistency.
- **Legacy Endpoint Removal**: Removed obsolete /api/switch-role endpoint from server/routes.ts to prevent bypass of secure multi-role flow.

### November 20, 2025
- **Transactional Role Lifecycle Implementation (PRODUCTION-READY)**: Completed full transactional implementation of multi-role activeRole lifecycle management with atomic guarantees. POST/DELETE role operations now wrapped in database transactions ensuring atomicity and data consistency.
- **Primary Role Invariant Enforcement**: System now enforces single primary role invariant - when adding/removing roles, transactions atomically clear existing primary flags and set new primary, preventing multiple primary roles. Legacy data self-heals when activeRole is null by detecting existing primary roles.
- **Active Role Lifecycle Rules**: POST endpoint sets activeRole/activeRoleId when adding primary role, or when user has no activeRoleId (checks for existing primary first, promotes new role to primary if none exists). DELETE endpoint checks user_roles.isPrimary (not just users.role) and falls back to another role (ORDER BY isPrimary DESC, createdAt ASC).
- **Users Listing & Edit Dialog Fix**: GET /api/school-admin/users returns activeRole || role ensuring UI always shows current active role. ManageUserRolesDialog properly extracts roles from {user, roles} response with schoolName included via left join.
- **Multi-Role Access Control**: SchoolAdmins can only manage users and assign roles within their own school (strict enforcement lines 376-390, 485-500 in user-roles.ts).

## System Architecture
### Core Design Principles
The platform emphasizes scalability, security, and user experience, incorporating role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.
-   **State Management**: React hooks and context.

### Backend
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication using `supabaseAuth`.

### Authentication Standards
Uses Supabase-only authentication; all protected API endpoints must use `supabaseAuth` middleware and extract user email from `req.user.email`. The middleware maps Supabase UUID to database integer ID in `req.user.id` for multi-role API compatibility.

### Currency Formatting Standards
All currency values are stored and transmitted as raw cents by the backend. The frontend formats these amounts using `CurrencyUtils` helpers from `shared/currency-utils.ts`.

### Data Storage
-   **Primary Database**: Neon PostgreSQL.
-   **File Storage**: Local filesystem for general files and knowledge bases.
-   **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
-   **Storage Architecture**: Hybrid system routing operations between persistent database and in-memory storage.

### Key Features
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: PHASE 3 COMPLETE - Users can hold multiple roles simultaneously (e.g., parent AND educator) with dynamic role-switching capabilities limited to same-school contexts for security. System uses database junction tables (user_roles), comprehensive backend APIs with security controls, React Query-based frontend integration with RoleContext and RoleSwitcher components visible in the header, and admin role management UI. **Same-School Role Switching Policy**: Users can only switch between roles at their current school to prevent cross-tenant data leakage; cross-school switches are blocked at both UI and API levels. Active role persistence implemented via activeRoleId column in users table, ensuring role state survives page reloads. Admin UI allows school administrators to view, add, and remove multiple roles per user with visual indicators for primary roles and school associations, restricted to their own school's users.
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
-   **Parent Class Details Page**: Dedicated full-page view for class details.
-   **Edit Child Profile Page**: Dedicated page for editing child profiles.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools, including auto-sync for existing children.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **Enrollment Count Display**: Class enrollment counts accurately reflect valid statuses.
-   **Category Management System**: School-level custom category system with dynamic dropdown integration and idempotent seeding of default categories.

## External Dependencies
-   **Supabase**: PostgreSQL database and OAuth authentication.
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