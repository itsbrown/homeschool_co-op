# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, serving parents, educators, school administrators, and students. It integrates full-stack web architecture with AI-powered content generation and educational assessment tools. The platform aims to provide a comprehensive and engaging educational experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Library**: Shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **State Management**: React hooks and context
- **Authentication**: Auth0 integration

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API
- **File Handling**: Multer
- **Authentication Middleware**: Auth0 JWT validation

### Data Storage Solutions
- **Primary Database**: Supabase (PostgreSQL-based) for user, school, and content data
- **File Storage**: Local filesystem for general files
- **Knowledge Base Storage**: File-based system
- **Image Processing**: SVG generation for educational content

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, school_admin, platform_admin) and JWT validation.
- **Enhanced Payment System**: Comprehensive payment status management supporting multiple states (pending_payment, partially_paid, payment_plan_active, enrolled with balance_due). Cart system intelligently handles enrolled items with remaining balances for payment plan scenarios. Fully functional Stripe webhook integration with proper currency conversion handling.
- **AI Enrollment Assistant**: Personalized AI assistant that greets users by their actual account name (extracted from authentication metadata) and provides enrollment guidance.
- **Staff Invitation System**: Complete automated staff onboarding with secure token-based invitations (7-day expiration), automatic Supabase account creation, temporary password generation, professional email notifications, and seamless resend functionality for individual and bulk operations.
- **Staff Management**: Dynamic staff position management with school-specific roles, comprehensive staff editing with data persistence, and role synchronization between invitation and edit forms.
- **Password Reset System**: Fully functional password reset via email with persistent token storage, Brevo email integration, Supabase password updates, and secure token cleanup. Supports both existing users and new account creation scenarios.
- **Email Service**: Real email delivery through Brevo SMTP service with professional templates for payment confirmations, staff invitations, and password resets. Configured with verified sender email and working API integration.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, AI-powered content analysis and generation (e.g., coloring pages, worksheets).
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis and curriculum generation, Stability AI for image generation, and Hugging Face for text processing.
- **Educational Tools**: Generators for professional coloring pages and various educational activities, curriculum/lesson plan creation, and student work analysis.
- **Data Flow**: Secure user authentication via Auth0, AI-driven content processing post-upload, activity generation, role-based content access, and persistence in Supabase.
- **UI/UX Decisions**: Focus on a professional and intuitive user experience with clear navigation, dynamic updates, and consistent design. Examples include consolidated navigation, simplified page structures, robust data handling for mixed formats (interests as strings/arrays), and clear payment plan selections.
- **Payment Plan Logic**: Any payment (even minimum 10%) immediately changes enrollment status to "enrolled", allowing students to access classes while maintaining remaining balance for payment plans. Cart filtering properly excludes fully paid enrollments while showing items with remaining balances as "Balance Due". Full payment plan functionality with accurate currency conversion - users can select payment plans (deposit, split, 3-month) and are charged the correct amount with proper email confirmations.

## External Dependencies
- **Auth0**: Primary authentication provider.
- **Anthropic Claude API**: For AI content generation and analysis.
- **Stability AI**: For image generation.
- **Hugging Face Inference API**: For text processing and analysis.
- **Supabase**: PostgreSQL database with real-time capabilities.
- **Shadcn/ui**: React component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Vite**: Build tool and development server.
```