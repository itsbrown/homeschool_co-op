# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform provides personalized learning paths, efficient administrative tools, and aims to deliver an adaptive, secure, and user-friendly learning environment for diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience with a modern web application architecture, featuring role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive, and responsive design (mobile-first approach).
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system routing operations between persistent database storage and in-memory storage.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync.
- **School Branding System**: Allows school administrators to upload and display school logos.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
- **Discount Systems**: Free After Threshold Discount System configurable by school administrators, with automatic suppression of other discounts.
- **Enrollment Management**: Robust system preventing duplicate enrollments, managing a clear status workflow (pending_payment, enrolled, waitlist, cancelled, completed, withdrawn, failed), and integrated with the cart-to-checkout flow. Includes a cart clearing system.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation and foreign key constraint validation on deletion.
- **Registration Flow**: Two-tier registration system with school code validation and robust duplicate prevention across PostgreSQL and Supabase, ensuring atomic school association with full rollback on failure.
- **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, dynamic position management, and intelligent status detection with batched pending invitation checks.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with cryptographically secure token generation (crypto.randomBytes), Supabase UUID-based authentication, dual-database password synchronization, and comprehensive error logging. Fixed critical bug where local database IDs were incorrectly used instead of Supabase UUIDs, which caused 500 errors during password updates.
- **Welcome Email System**: Automated welcome emails sent to new registrants after successful account creation, featuring professional HTML design, login link, and role-aware messaging. Uses BREVO_SENDER_EMAIL for sender address with graceful error handling that doesn't block registration.
- **Parent Profile Management**: Parent users can update their profile information.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details with route-based navigation.
- **Edit Child Profile Page**: Dedicated page for editing child profiles using the ParentAppShell component.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages.
- **Student Management System**: Comprehensive system for tracking and displaying students across schools, including auto-sync functionality for backfilling existing children into `school_students` table.
- **Notification System**: In-app notification system with PostgreSQL storage, automatic data seeding from JSON files at server startup using transactional upserts, real-time unread count badge on bell icon, optimistic UI updates via React Query cache invalidation, and mark-as-read functionality that updates notification recipients with accurate status tracking.

## External Dependencies
- **Auth0**: Authentication provider.
- **Anthropic Claude API**: AI content generation and analysis.
- **Stability AI**: Image generation.
- **Hugging Face Inference API**: Text processing and analysis.
- **Supabase**: PostgreSQL database and OAuth.
- **Shadcn/ui**: React component library.
- **Tailwind CSS**: CSS framework.
- **Vite**: Build tool.
- **Stripe**: Payment processing.
- **Brevo SMTP**: Email service.
- **SendGrid**: Email service.
- **Twilio**: SMS service.