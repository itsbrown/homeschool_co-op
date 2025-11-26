# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application designed for the American Seekers Academy. It offers a comprehensive and engaging educational experience through a full-stack web architecture, AI-powered content generation, and robust assessment tools. The platform aims to provide personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

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
-   **Multi-Role System**: Supports users holding multiple roles with dynamic, school-context-restricted role-switching capabilities.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, automated refunds, and automatic payment reminders.
-   **Payment Reminder System**: Automated email reminders for scheduled payments at T-7, T-3, T-1, T+0 (due day), and T+1 (overdue) days. Uses Brevo SMTP for delivery.
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
-   **Dedicated Detail/Edit Pages**: Specific pages for parent class details and editing child profiles.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across admin pages.
-   **Student Management System**: Tracks students across schools, including auto-sync for existing children.
-   **Notification System**: In-app notification system with PostgreSQL storage and real-time unread counts.
-   **Category Management System**: School-level custom category system with dynamic dropdown integration and idempotent seeding of default categories.
-   **Interactive Onboarding Tour**: Custom-built guided tour for new parent accounts explaining dashboard features, enrollment workflow, and emphasizing that children are only enrolled after first payment. School admins can toggle this feature on/off.

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