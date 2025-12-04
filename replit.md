# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application designed for the American Seekers Academy. It offers a comprehensive and engaging educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## Debugging Guidelines
- **Trace the entire request flow from endpoint to database before making fixes**, not just the layer where the problem appears to be. Follow the code path through: API route → storage interface → actual storage implementation (database or memory) to ensure all layers are using the correct data source.
- **HybridStorage architecture**: `dbStorage` can be either DatabaseStorage or MemStorage (fallback). Use identity comparison (`this.dbStorage !== this.memStorage`) to detect real database availability.
- **Watch for duplicate storage mechanisms**: Some API files may have their own in-memory Maps or caches that bypass the central storage system entirely. Check for module-level variables in API route files.

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
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, user metadata auto-sync, and **automatic database user creation** for Supabase-authenticated users who don't yet have local database records.
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