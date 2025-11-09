# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy, providing a comprehensive and engaging educational experience. It integrates full-stack web architecture with AI-powered content generation and assessment tools to offer robust educational support, personalized learning paths, and efficient administrative tools for all users. The platform aims to deliver an adaptive, secure, and user-friendly learning environment catering to diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform utilizes a modern web application architecture prioritizing scalability, security, and user experience. It features role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional and intuitive design with consolidated navigation.
- **Responsive Design**: Mobile-first approach with breakpoint-specific layouts:
  - Mobile (<md): Card-based layouts for list views, stacked filters/controls
  - Tablet (md-lg): Optimized table views with responsive columns
  - Desktop (lg+): Full-featured table views with all columns visible
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data (enrollment, payment, financial tracking).
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system (CombinedStorage) routing operations between persistent database storage (dbStorage) and in-memory storage (memStorage) for feature-specific data. Critical data (Classes, Schools, Children, Enrollments, Stripe Subscriptions, etc.) are in PostgreSQL.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, schoolAdmin, admin, superAdmin) and JWT validation. School-admin API endpoints are protected with Supabase JWT authentication.
- **Multi-Tenant Security**: Comprehensive isolation preventing cross-school data leakage, with strict school boundary validation enforced on all school-admin API endpoints using JWT tokens.
- **Security Architecture & Metadata Management**:
  - **Database as Source of Truth**: All user metadata (schoolId, role, name) is derived from the PostgreSQL database, NOT from JWT tokens or user-editable fields
  - **Auto-Sync Mechanism**: Authentication middleware (`server/middleware/supabase-auth.ts`) automatically detects and corrects metadata mismatches on every authenticated request
  - **Tampering Detection**: Enhanced monitoring logs security alerts when metadata doesn't match database values, enabling detection of tampering attempts
  - **Current Implementation (Phase 1)**: Uses Supabase `user_metadata` (user-editable) with automatic synchronization from database to prevent security issues
  - **Migration Strategy**: Three-phase approach to migrate from `user_metadata` to `app_metadata` (admin-only, immutable):
    - **Phase 1 (Current)**: Email notifications for new student registrations, enhanced security monitoring and logging
    - **Phase 2 (Planned)**: New user signups write to `app_metadata`, existing users continue with auto-sync fallback
    - **Phase 3 (Future)**: Gradual batch migration of existing users to `app_metadata` during controlled maintenance windows
  - **Notification System**: School administrators receive dual-channel notifications (email + in-app) when new students register, with graceful error handling to prevent registration failures
- **School Branding System**: 
  - **Logo Storage**: School logos stored in the `schools.logo` field (text field containing URL/path to image file)
  - **Logo Upload**: School administrators can upload logos via the School Settings page (`/schools/settings`) after school creation
  - **Logo Display**: School logo and name are displayed consistently across all user interfaces:
    - **Parent Interface**: ParentSidebar and ParentAppShell show school logo/name
    - **School Admin Interface**: UnifiedSchoolAdminSidebar displays school logo/name for administrators and educators
    - **Fallback Behavior**: If no logo is uploaded, displays school name only; if no school data available, displays "ASA Platform" as default
  - **Responsive Sizing**: Logo sizes adapt to context (8px height for desktop sidebar, 6px for mobile)
  - **Error Handling**: Images with broken URLs gracefully hide via `onError` handler
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system featuring subscription schedules, webhooks, smart cart logic, date-driven payment plans, and automated refund processing.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing. All class CRUD operations enforce strict school isolation. Edit form dropdowns (location, instructor, status) properly pre-select existing values when editing.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management. Requires `CLIENT_URL` environment variable set to production domain for correct email links.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema with 'product' field type supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.
- **Responsive UI Patterns**: Consistent mobile-responsive patterns across school admin pages (Classes, Students, Staff) with:
  - Desktop: Full table views with all data columns
  - Mobile: Card-based layouts with essential info and dropdown actions
  - Filters: Stack vertically on mobile, row layout on desktop
  - Action buttons: Full-width on mobile, auto-width on desktop

### Environment Variables
- **CLIENT_URL**: Required for production deployment. Must be set to the production domain (e.g., `https://accounts.americanseekersacademy.com`) for correct email link generation (staff invites, password resets, account invitations). Without this, emails will contain incorrect URLs.

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