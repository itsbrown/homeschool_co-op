# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, designed to serve parents, educators, school administrators, and students. It integrates full-stack web architecture with AI-powered content generation and educational assessment tools to provide a comprehensive and engaging educational experience. The platform aims to offer robust educational support, personalized learning paths, and efficient administrative tools for various user roles.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform follows a modern web application architecture, emphasizing scalability, security, and a rich user experience. It incorporates role-based access control, AI-driven content generation, and a comprehensive payment system.

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Library**: Shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **State Management**: React hooks and context
- **Authentication**: Auth0 integration
- **UI/UX Decisions**: Focus on a professional and intuitive user experience with clear navigation, dynamic updates, and consistent design. Features include consolidated navigation, simplified page structures, robust data handling, and clear payment plan selections.

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API
- **File Handling**: Multer
- **Authentication Middleware**: Auth0 JWT validation

### Data Storage
- **Primary Database**: Supabase (PostgreSQL-based) for user, school, and content data
- **Database Connection**: URL-encoded connection string builder (`server/lib/database-url.ts`) to properly handle special characters in credentials for both runtime and drizzle-kit operations
- **File Storage**: Local filesystem for general files, file-based system for knowledge bases.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, school_admin, platform_admin) and JWT validation. Includes custom form builder security hardening with ownership and cross-tenant checks.
- **Enhanced Payment System**: Comprehensive Stripe-only payment system with subscription schedules, webhook integration, and smart cart logic to manage enrollments and prevent duplicates. Supports various payment statuses and plans.
- **Complete Registration Flow**: Automated account creation with user-provided passwords, handling of existing accounts, and seamless auto-login.
- **AI Enrollment Assistant**: Personalized AI assistant providing enrollment guidance based on user authentication metadata.
- **Staff Management & Invitation System**: Automated staff onboarding with secure token-based invitations, Supabase account creation, temporary passwords, and professional email notifications. Dynamic staff position management and comprehensive editing with data persistence. Staff data is migrated to the production database.
- **User Account Management**: School administrators can send account invites and password reset emails to users.
- **Password Reset System**: Fully functional email-based password reset with persistent token storage and secure updates.
- **Email Service**: Dual email service integration (Brevo SMTP and SendGrid) for various notifications and account management features, utilizing professional email templates.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis and generation (coloring pages, worksheets, lesson plans).
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis and curriculum generation, Stability AI for image generation, and Hugging Face for text processing.
- **Educational Tools**: Generators for professional coloring pages and various educational activities, curriculum/lesson plan creation, and student work analysis.
- **Data Flow**: Secure user authentication, AI-driven content processing post-upload, activity generation, role-based content access, and persistence in Supabase.

### Planned Features
- **School Subscription Tiers**: A tiered subscription system for schools (Basic, Pro, Enterprise) for premium features, implemented with database schema additions, feature gate infrastructure, and Stripe integration.
- **Role Naming Convention Standardization**: Standardize all role names to camelCase (`schoolAdmin`) across the application, involving database mapping, backend and frontend cleanup, and comprehensive testing.

## External Dependencies
- **Auth0**: Primary authentication provider.
- **Anthropic Claude API**: For AI content generation and analysis.
- **Stability AI**: For image generation.
- **Hugging Face Inference API**: For text processing and analysis.
- **Supabase**: PostgreSQL database with real-time capabilities.
- **Shadcn/ui**: React component library for UI.
- **Tailwind CSS**: Utility-first CSS framework.
- **Vite**: Build tool and development server.
- **Stripe**: Payment processing for subscriptions and enrollments.
- **Brevo SMTP**: Email service for notifications.
- **SendGrid**: Email service for account management features.
- **Twilio**: SMS service for notifications.