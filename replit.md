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

## Recent Changes

**Role-Based System Debugging & Enhancements (October 13, 2025)**
- ✅ **CRITICAL FIX**: Resolved auth0_id database schema error - migrated users table to include auth0_id and supabase_id columns
- ✅ Fixed LSP errors in EducatorDashboard.tsx (proper type annotations)
- ✅ Enhanced Parent dashboard children tab to display enrollments per child with status badges
- ✅ Fixed "View Profile" navigation across all role dashboards
- ✅ Created comprehensive Twilio SMS service module (server/services/twilio.ts)
- ✅ **Fully integrated Twilio SMS into notification system** - supports email, in-app, SMS, and "all" delivery types
- ✅ Fixed async/await handling in notification processing for proper Twilio configuration checks
- ✅ Created currency formatting utilities for consistent price displays (server/utils/currency.ts)
- ✅ Created comprehensive role testing guide (ROLE_TESTING_GUIDE.md)
- ✅ Educator account setup complete (jocimarie@gmail.com) with 4 assigned classes
- ⏳ Currency utilities created, ready for UI integration
- 📋 Testing Guide: Complete procedures for Parent, Educator, School Admin, Super Admin roles
- 🎯 **System Status**: All critical errors resolved, platform running cleanly with SMS notification support

**Completed Stripe-Only Payment System Migration (September 5, 2025)**
- ✅ Enhanced schema with Stripe integration fields for programEnrollments table
- ✅ Added stripeSubscriptionSchedules table for tracking Stripe payment plans
- ✅ Created comprehensive Stripe payment plan service with subscription schedules
- ✅ Built migration scripts for moving from manual scheduling to Stripe native
- ✅ Implemented webhook handling for Stripe subscription schedule events
- ✅ Added API endpoints for migration management and status tracking
- ✅ Cleaned payment history and scheduled payments for fresh start
- ✅ Updated storage interface to support Stripe subscription schedules
- ✅ Removed legacy payment system endpoints and manual scheduling functions
- ✅ Updated frontend components to only use Stripe-managed payment statuses
- ✅ Migrated all enrollments to use 'stripe_managed' payment system version v2
- 🎯 System now runs entirely on Stripe's native payment infrastructure with no legacy payment code

**Fixed Class Creation and Enrollment Issues (August 22, 2025)**
- Fixed storage system synchronization between file-based and memory storage
- Class creation now properly adds classes to both storage systems 
- Time picker component updated with improved selection logic
- All 4 classes now load correctly into memory storage
- Class enrollment API working for all existing and newly created classes
- Created production setup guide and test data cleanup script

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, school_admin, platform_admin) and JWT validation.
- **Enhanced Payment System**: Comprehensive payment status management supporting multiple states (pending_payment, partially_paid, payment_plan_active, enrolled with balance_due). Smart cart system that prevents duplicate enrollments by checking for successful payments, properly filtering out superseded pending enrollments. Fully functional Stripe webhook integration with proper currency conversion handling.
- **Complete Registration Flow**: Fixed incomplete parent registration system by adding password fields to school-specific registration page (/register/SCHOOLCODE). System now creates accounts automatically with user-provided passwords, handles existing account scenarios with clear messaging, and provides seamless auto-login to dashboard after registration.
- **AI Enrollment Assistant**: Personalized AI assistant that greets users by their actual account name (extracted from authentication metadata) and provides enrollment guidance.
- **Staff Invitation System**: Complete automated staff onboarding with secure token-based invitations (7-day expiration), automatic Supabase account creation, temporary password generation, professional email notifications, and seamless resend functionality for individual and bulk operations.
- **Staff Management**: Dynamic staff position management with school-specific roles, comprehensive staff editing with data persistence, and role synchronization between invitation and edit forms.
- **Password Reset System**: Fully functional password reset via email with persistent token storage, Brevo email integration, Supabase password updates, and secure token cleanup. Supports both existing users and new account creation scenarios.
- **User Account Management**: School administrators can send account invites and password reset emails to any user through the user management interface. Account invites generate temporary passwords and send professional welcome emails with login credentials. Password reset functionality creates secure 24-hour tokens and sends reset links via email.
- **Email Service**: Dual email service integration with both Brevo SMTP service for existing functionality and SendGrid for new account management features. Professional email templates for payment confirmations, staff invitations, password resets, and account invitations. Configured with verified sender email and working API integration.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, AI-powered content analysis and generation (e.g., coloring pages, worksheets).
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis and curriculum generation, Stability AI for image generation, and Hugging Face for text processing.
- **Educational Tools**: Generators for professional coloring pages and various educational activities, curriculum/lesson plan creation, and student work analysis.
- **Data Flow**: Secure user authentication via Auth0, AI-driven content processing post-upload, activity generation, role-based content access, and persistence in Supabase.
- **UI/UX Decisions**: Focus on a professional and intuitive user experience with clear navigation, dynamic updates, and consistent design. Examples include consolidated navigation with single "Payments" entry replacing multiple payment-related menu items (Payment Plans, Billing & Payments, Payment History), simplified page structures, robust data handling for mixed formats (interests as strings/arrays), and clear payment plan selections.
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