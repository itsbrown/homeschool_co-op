# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for American Seekers Academy. It provides a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and educational assessment tools. The platform offers robust educational support, personalized learning paths, and efficient administrative tools for parents, educators, school administrators, and students. Its vision is to deliver an adaptive, secure, and user-friendly learning environment that caters to diverse educational needs.

## User Preferences
Preferred communication style: Simple, everyday language.

## AI Agent Development Guardrails

**CRITICAL: These guardrails prevent systematic failures and ensure production-ready code quality.**

### 1. NO WORKAROUNDS OR TEMPORARY FIXES
- **NEVER** use workarounds, hacks, or temporary solutions
- **NEVER** add "TODO" comments for incomplete functionality
- **NEVER** use placeholder data or mock implementations in production code paths
- **ALWAYS** implement complete, production-ready solutions
- **ALWAYS** fix root causes, not symptoms
- If you cannot implement a complete solution, stop and ask for clarification

### 2. SYSTEMATIC ROOT CAUSE ANALYSIS
- **ALWAYS** investigate the root cause before making any changes
- **NEVER** apply fixes without understanding why the issue exists
- **ALWAYS** add diagnostic logging to understand data flow
- **ALWAYS** verify your understanding of the problem with evidence (logs, database queries, code inspection)
- Document your findings before implementing solutions

### 3. TYPE-SAFE FACTORY PATTERNS
- **ALWAYS** use type-safe factory patterns for data creation (see `shared/enrollment-factory.ts` as example)
- **NEVER** manually construct objects with duplicate field logic
- **ALWAYS** validate data at boundaries using Zod schemas
- **ALWAYS** ensure TypeScript types match database schema types exactly

### 4. COMPREHENSIVE TESTING
- **ALWAYS** test changes thoroughly before marking complete
- **ALWAYS** verify database queries return expected results
- **ALWAYS** check both success and error paths
- **NEVER** assume code works without verification

### 5. DOCUMENTATION DISCIPLINE
- **ALWAYS** keep replit.md updated with significant architectural changes
- **ALWAYS** document data model changes immediately
- **ALWAYS** update integration documentation when adding/removing external services
- **NEVER** leave documentation outdated or incomplete

### 6. MULTI-TENANT SECURITY ENFORCEMENT
- **ALWAYS** validate schoolId boundaries in every school-admin endpoint
- **ALWAYS** use JWT tokens for school isolation
- **NEVER** allow cross-school data leakage
- **ALWAYS** test with multiple school contexts

### 7. DATABASE INTEGRITY
- **NEVER** change primary key ID column types (serial ↔ varchar) - this breaks existing data
- **ALWAYS** use `npm run db:push --force` for schema sync, never manual migrations
- **ALWAYS** preserve existing ID types when modifying schemas
- **ALWAYS** verify database state before and after changes

### 8. COMPLETE IMPLEMENTATION CHECKLIST
Before marking any task complete, verify:
- ✅ Root cause identified and documented
- ✅ Solution is complete and production-ready (no TODOs, no placeholders)
- ✅ Types are correct and match database schema
- ✅ All code paths tested (success and error cases)
- ✅ Multi-tenant security validated
- ✅ Documentation updated
- ✅ No LSP errors remain
- ✅ Database queries verified with actual data
- ✅ Frontend and backend integration confirmed

### 9. PROACTIVE QUALITY ASSURANCE
- **ALWAYS** be proactive in finding and fixing issues
- **NEVER** wait for user to report bugs
- **ALWAYS** think systematically about edge cases
- **ALWAYS** verify assumptions with evidence

### 10. NO REACTIVE "FIRE FIGHTING"
- **NEVER** rush to fix symptoms without understanding causes
- **ALWAYS** take time to understand the full context
- **ALWAYS** plan comprehensive fixes that address all related issues
- **NEVER** create new problems while fixing old ones

## System Architecture
### Core Design Principles
The platform uses a modern web application architecture focused on scalability, security, and user experience. It incorporates role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive design with consolidated navigation.
- **State Management**: React hooks and context.
- **Authentication**: Auth0 integration.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful JSON API.
- **File Handling**: Multer.
- **Authentication Middleware**: Auth0 JWT validation.

### Data Storage
- **Primary Database**: Neon PostgreSQL for all application data (enrollment, payment, financial tracking).
- **File Storage**: Local filesystem for general files and knowledge bases.
- **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
- **Storage Architecture**: Hybrid system (CombinedStorage) routing operations between persistent database storage (dbStorage) and in-memory storage (memStorage) for feature-specific data. Critical data (Classes, Schools, Children, Enrollments, Stripe Subscriptions, etc.) are in PostgreSQL.

### Key Features and Implementations
- **Authentication and Authorization**: Auth0-based secure authentication with role-based access control (parent, educator, schoolAdmin, admin, superAdmin) and JWT validation. School-admin API endpoints are protected with Supabase JWT authentication.
- **Multi-Tenant Security**: Comprehensive isolation prevents cross-school data leakage. All school-admin API endpoints enforce strict school boundary validation using JWT tokens.
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system with subscription schedules, webhooks, smart cart logic, date-driven payment plans, and automated refund processing.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing. All class CRUD operations enforce strict school isolation.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema with 'product' field type supporting variant configurations, descriptions, and dynamic pricing. Includes pre-built templates and a form builder UI.

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