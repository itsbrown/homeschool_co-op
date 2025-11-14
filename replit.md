# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform aims to provide personalized learning paths, efficient administrative tools, and a secure, user-friendly learning environment tailored for diverse educational needs, with a vision for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience through a modern web application architecture. This includes role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS are used for a professional, intuitive, and responsive design with a mobile-first approach.
- **State Management**: React hooks and context.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Supabase-only authentication using `supabaseAuth` middleware.

### Authentication Standards
The platform has fully migrated to Supabase-only authentication. All new protected API endpoints must use `supabaseAuth` middleware and extract user email from `req.user.email`. Legacy Auth0 middleware (`jwtCheck`) is being phased out.

### Currency Formatting Standards
All currency values are stored and transmitted as raw cents (numbers) by the backend. The frontend is responsible for formatting these amounts using `CurrencyUtils` helpers from `shared/currency-utils.ts` for display and calculations, ensuring consistency and preventing errors.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system routing operations between persistent database storage and in-memory storage.

### Key Features and Implementations
- **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. Includes robust user creation flows (registration, account invite, admin user creation) that link to Supabase accounts via `supabaseId`.
- **School Branding System**: Allows school administrators to upload and display school logos.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
- **Discount Systems**: Database-managed Free After Threshold Discount System, configurable by school administrators.
- **Enrollment Management**: Robust system preventing duplicate enrollments, managing a clear status workflow (e.g., `pending_payment`, `enrolled`, `waitlist`), and integrated with the cart-to-checkout flow.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation.
- **Registration Flow**: Two-tier registration with school code validation and duplicate prevention, ensuring atomic school association with full rollback on failure.
- **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with cryptographically secure token generation, Supabase UUID-based authentication, and dual-database password synchronization.
- **Welcome Email System**: Automated, professional HTML welcome emails for new registrants, including login links and role-aware messaging.
- **Parent Profile Management**: Parent users can update their profile information.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details with route-based navigation.
- **Edit Child Profile Page**: Dedicated page for editing child profiles.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages.
- **Student Management System**: Comprehensive system for tracking and displaying students across schools, including auto-sync for existing children and automatic record creation for enrollments.
- **Notification System**: In-app notification system with PostgreSQL storage, real-time unread count, and mark-as-read functionality.
- **Enrollment Count Display**: Class enrollment counts accurately reflect valid statuses ('enrolled', 'completed').

## External Dependencies
- **Supabase**: PostgreSQL database and OAuth authentication.
- **Stripe**: Payment processing.
- **Anthropic Claude API**: AI content generation and analysis.
- **Stability AI**: Image generation.
- **Hugging Face Inference API**: Text processing and analysis.
- **Shadcn/ui**: React component library.
- **Tailwind CSS**: CSS framework.
- **Vite**: Build tool.
- **Brevo SMTP**: Email service.
- **SendGrid**: Email service.
- **Twilio**: SMS service.