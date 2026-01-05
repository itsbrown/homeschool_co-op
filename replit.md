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

### Educator Dashboard
Provides educators/mentors with tools to manage classes, track attendance, view lesson plans, and log work hours. It integrates with the Daily Flow system and features a dedicated `EducatorAppShell` with role-specific routing.

## External Dependencies
-   **Supabase**: Authentication.
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