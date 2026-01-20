# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application designed for the American Seekers Academy. It delivers a comprehensive educational experience through a full-stack web architecture, integrating AI for content generation and robust assessment tools. The platform aims to provide personalized learning, efficient administration, and a secure, user-friendly environment, positioning itself as a leader in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The platform is built on a full-stack architecture prioritizing scalability, security, and user experience. It incorporates role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security.

**Frontend:**
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, responsive, and mobile-first design.
-   **State Management**: React hooks and context.

**Backend:**
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication; protected API endpoints use `supabaseAuth` and map Supabase UUID to an integer ID.

**Data Persistence:**
-   **Primary Database**: PostgreSQL (Neon-hosted) for all application data.
-   **ORM**: Drizzle ORM for CRUD operations, with schema defined in `shared/schema.ts` for type safety.
-   **Supabase**: Exclusively for authentication, not for general data persistence.

**Key Features:**
-   **Authentication & Authorization**: Supabase-based secure authentication with role-based access control, multi-tenant security, and user metadata auto-sync.
-   **Multi-Role System**: Supports dynamic, school-context-restricted role-switching.
-   **School Branding & Membership**: Allows school administrators to manage branding, annual membership fees, and enrollment validation.
-   **Payment System**: Stripe-only with subscription schedules, webhooks, smart cart logic, and server-side authoritative pricing.
-   **Cart & Discount Systems**: TanStack Query-based cart with API-first state management; database-managed comprehensive discount system (19+ types).
-   **Enrollment & Class Management**: Manages enrollment workflows, prevents duplicates, and allows school administrators to create/manage classes with multi-variant pricing.
-   **AI Integration**: AI Enrollment Assistant for personalized guidance; AI Smart Tutorial System (Anthropic Claude) for conversational help; AI Payment Help Assistant (Anthropic Claude) for payment inquiries.
-   **Content Management System**: Creation and management of knowledge bases, file uploads, and AI-powered content analysis/generation.
-   **Student Management System**: Tracks students across schools.
-   **Notification System**: In-app notifications with PostgreSQL storage and real-time unread counts.
-   **System Error Monitoring**: Comprehensive error tracking with database logging and automatic notifications.
-   **Unified Credit System**: Extensible multi-type credit system (volunteer, referral, achievement, marketing, manual) with admin approval and FIFO consumption.
-   **Fundraiser System**: Complete management for product-based campaigns for schools, including storefront and credit integration.
-   **Refund Management System**: Comprehensive refund processing with pro-rated calculator, structured reason codes, and analytics.
-   **Payment Reminder Tracking System**: Complete audit logging for automatic and manual payment reminders with school admin visibility.
-   **Educator Dashboard**: Tools for educators to manage classes, attendance, lesson plans, and log work hours, integrated with Daily Flow.
-   **Unified File Upload System**: Production-grade system using Replit App Storage for secure, scalable file handling with category-based validation and presigned URLs.

**Core Architectural Principles:**
-   **Scheduled Payment Synchronization System**: Ensures scheduled payment statuses sync with actual payments via real-time and daily batch reconciliation.
-   **Server-Authoritative Cart Pricing**: The server is the single source of truth for all cart pricing to prevent payment mismatches.
-   **Server-Authoritative Enrollment Payment Display**: `totalPaid` and `remainingBalance` fields on enrollment are the single source of truth for payment display.

## External Dependencies
-   **Supabase**: Authentication.
-   **Replit App Storage**: Object storage for file uploads.
-   **Neon PostgreSQL**: Primary database.
-   **Stripe**: Payment processing.
-   **Anthropic Claude API**: AI content generation and analysis.
-   **Brevo SMTP**: Email service.
-   **SendGrid**: Email service.
-   **Twilio**: SMS service.