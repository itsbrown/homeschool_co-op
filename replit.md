# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, designed to provide a comprehensive and engaging educational experience. It integrates full-stack web architecture with AI-powered content generation and educational assessment tools, offering robust educational support, personalized learning paths, and efficient administrative tools for parents, educators, school administrators, and students.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform utilizes a modern web application architecture prioritizing scalability, security, and user experience. It incorporates role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript, using Vite.
- **UI**: Shadcn/ui (built on Radix UI) and Tailwind CSS for a professional, intuitive design with consolidated navigation and simplified page structures.
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **File Handling**: Multer.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data, including enrollment, payment, and financial tracking.
- **Database Connection**: URL-encoded connection string builder.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system using CombinedStorage, routing operations between database storage (dbStorage) for persistent data and in-memory storage (memStorage) for feature-specific data. All critical data, including Classes, Schools, Children, School Students, Membership Enrollments, Stripe Subscription Schedules, Locations, User Locations, Marketplace Class Enrollments, Staff Positions, Staff Invitations, and Password Reset Tokens, have been migrated to persistent PostgreSQL storage.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, schoolAdmin, admin, superAdmin) and JWT validation. All school-admin API endpoints protected with Supabase JWT authentication middleware.
- **Multi-Tenant Security**: Comprehensive isolation preventing cross-school data leakage. All hardcoded school IDs eliminated from codebase. All 30+ school-admin API endpoints enforce strict school boundary validation using helper functions (extractSchoolId, requireSchoolContext) that extract and validate school_id from JWT tokens. Cross-school data access returns 403 Forbidden. Account import processes enforce strict school-scoped validation.
- **Membership Management System**: Admin interface for managing annual membership fees, enrollment validation, and manual payment recording.
- **Payment System**: Stripe-only payment system with subscription schedules, webhook integration, smart cart logic, date-driven payment plans, and automated refund processing.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing (e.g., Morning Session vs. Afternoon Session with different prices). Pricing extracted from variants array and stored in both price field (first variant) and schedule jsonb field (all variants). Currency handled in cents internally.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.

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