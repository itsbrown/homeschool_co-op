# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It provides a comprehensive and engaging educational experience through full-stack web architecture, AI-powered content generation, and assessment tools. The platform aims to deliver personalized learning paths, efficient administrative capabilities, and a secure, user-friendly environment, positioning itself for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

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
-   **Multi-Role System**: PHASE 3 COMPLETE - Users can hold multiple roles simultaneously (e.g., parent AND educator, or educator at multiple schools) with dynamic role-switching capabilities. System uses database junction tables (user_roles), comprehensive backend APIs with security controls, and React Query-based frontend integration with RoleContext and RoleSwitcher components. Active role persistence implemented via activeRoleId column in users table, ensuring role state survives page reloads and correctly resolves school context for multi-school scenarios.
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