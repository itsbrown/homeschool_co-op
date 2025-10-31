# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It integrates full-stack web architecture with AI-powered content generation and educational assessment tools to provide a comprehensive and engaging educational experience for parents, educators, school administrators, and students. The platform aims to offer robust educational support, personalized learning paths, and efficient administrative tools.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform uses a modern web application architecture focused on scalability, security, and user experience, incorporating role-based access control, AI-driven content generation, and a comprehensive payment system.

### Frontend
- **Framework**: React with TypeScript, using Vite for building.
- **UI**: Shadcn/ui (built on Radix UI) and Tailwind CSS for styling.
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.
- **UI/UX Decisions**: Professional, intuitive design with consolidated navigation, simplified page structures, and consistent design.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **File Handling**: Multer.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data, including enrollment, payment, and financial tracking.
- **Database Connection**: URL-encoded connection string builder for credential handling.
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase directly for user/school data.
- **Storage Architecture**: Hybrid storage system using CombinedStorage pattern that routes operations between database storage (dbStorage) for persistent data and in-memory storage (memStorage) for feature-specific data.

### Recent Storage Migrations (October 2025)
The following critical tables have been migrated from in-memory storage to persistent database storage to fix data loss issues after server restarts:

**High-Priority Migrations (Completed)**:
- **Classes**: All class management operations now persist to PostgreSQL database
  - Migrated: 13 classes from classes.json to database (October 31, 2025)
  - Updated: Database schema to include all missing columns (school_id, location_id, schedule, etc.)
  - Removed: Startup code that loaded classes from JSON into memory storage
  - Fixed: Admin interface now exclusively uses database storage (no file storage fallback)
  - Updated: server/api/admin-classes.ts to use CombinedStorage/dbStorage
  - All class CRUD operations now persist to classes table (marketplace offerings)
  - Result: Database is the single source of truth for classes data - no data loss on restarts
- **Schools**: School data including registration codes now stored in database
  - Fixed: Schools API file storage fallback removed (was causing registration code mismatch)
  - Updated: server/api/schools.ts to query database only for all endpoints (GET /:id, GET /by-code/:code, POST /)
  - Removed: File storage checks from generateRegistrationCode function
  - Result: Admin UI now displays correct registration codes from database instead of stale JSON file data
- **Children**: Child profile data now persists exclusively to PostgreSQL database
  - Migrated: 75 children from children.json to database (October 31, 2025)
  - Removed: Startup code that loaded children from JSON into memory storage
  - Fixed: Dual storage issue where database creates were ignored in favor of stale JSON data
  - Updated: CombinedStorage routes all child operations to dbStorage
  - Result: Database is the single source of truth for children data - no data loss on restarts
- **School Students**: Student enrollment tracking now persists to database
  - Migrated: 72 school_students from school-students.json to database (October 31, 2025)
  - Removed: Startup code that loaded school_students from JSON into memory storage
  - Fixed: Dual storage issue causing stale data to override database records
  - Implemented: Full CRUD operations in dbStorage for school_students table
  - Updated: CombinedStorage routes school_students to dbStorage
  - Auto-create: school_student records when children are registered
  - Result: Database is the single source of truth for school_students - no data loss on restarts
- **Membership Enrollments**: Annual membership fee tracking and enrollment status now persistent
- **Stripe Subscription Schedules**: Payment plan tracking for Stripe integration now stored in database

**Feature-Specific Migrations (Completed)**:
- **Daily Flow Templates**: Curriculum planning templates now persist across restarts
- **Daily Flow Entries**: Individual scheduled activities and lesson tracking in database
- **Daily Flow Schedules**: Weekly recurring schedule templates stored persistently
- **Marketing Links**: Campaign tracking and analytics now stored in database with click counting

**Implementation Details**:
- All migrations implemented using Drizzle ORM with full CRUD operations
- CombinedStorage routes critical data operations to dbStorage (PostgreSQL)
- Legacy memStorage retained for non-critical feature data and caching
- No data loss on server restarts for migrated tables
- Admin interfaces updated to use database storage instead of file-based storage

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, schoolAdmin, admin, superAdmin) and JWT validation.
- **Membership Management System**: Admin interface for managing annual membership fees, including enrollment validation, manual payment recording, and status tracking. Supports multi-school environments and various membership statuses.
- **Admin Payment Plan Editing**: Allows school administrators to modify payment plans for existing enrollments via a dedicated UI, supporting different payment frequencies and providing an audit trail.
- **Enhanced Payment System**: Stripe-only payment system with subscription schedules, webhook integration, and smart cart logic.
- **Date-Driven Payment Plans**: Calculates installment schedules based on program dates (weekly, biweekly, monthly) rather than fixed counts, with specific logic for biweekly payments to ensure completion before program end.
- **Automated Refund Processing**: Admins can process full or partial refunds via Stripe API for Stripe payments, with internal records for manual payments.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated staff onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid for various notifications.
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