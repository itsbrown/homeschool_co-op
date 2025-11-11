# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform provides personalized learning paths, efficient administrative tools, and aims to deliver an adaptive, secure, and user-friendly learning environment for diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience with a modern web application architecture. Key features include role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive, and responsive design (mobile-first approach with breakpoint-specific layouts).
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
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control and JWT validation. Includes multi-tenant security with strict school boundary validation and an auto-sync mechanism for user metadata derived from the database. A phased migration strategy is in place for metadata management.
- **School Branding System**: Allows school administrators to upload and display school logos consistently across all user interfaces, with fallback behavior.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system featuring subscription schedules, webhooks, smart cart logic, and automated refund processing.
- **Free After Threshold Discount System**: Configurable by school administrators, offering free enrollments for additional children beyond a set threshold, with automatic suppression of other discounts to prevent stacking.
- **Enrollment Lifecycle & Duplicate Prevention**: Robust system preventing duplicate enrollments, managing a clear status workflow (pending_payment, enrolled, waitlist, cancelled, completed, withdrawn, failed), and integrating with the cart-to-checkout flow.
- **Cart Clearing System**: Allows users to clear their shopping cart, properly cancelling `pending_payment` enrollments in the database for audit trails, with strict ownership validation.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation. Class deletion includes foreign key constraint validation to prevent deletion when enrollments, discount applications, daily flow entries, or schedules exist, providing clear error messages.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Parent Profile Management**: Parent users can update their profile information via a settings page, with changes persisted to the PostgreSQL database.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Parent Class Details Page**: Dedicated full-page view for class details, replacing legacy dialogs with route-based navigation and consistent UI.
- **Edit Child Profile Page**: Dedicated page for editing child profiles using the ParentAppShell component for consistent navigation and layout.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages, adapting layouts, filters, and action buttons for optimal display on different devices.

### Environment Variables
- **CLIENT_URL**: Required for production to ensure correct email link generation for staff invites, password resets, and account invitations.

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