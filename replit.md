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

### 11. API REQUEST CONSISTENCY
- **ALWAYS** use `apiRequest` helper from `@lib/queryClient` instead of manual `fetch()` calls
- **ALWAYS** follow correct `apiRequest` signature: `apiRequest(method, url, body?, options?)`
  - ✅ CORRECT: `apiRequest('POST', '/api/locations', locationData)`
  - ❌ WRONG: `apiRequest('/api/locations', { method: 'POST', body: ... })`
- **NEVER** mix manual fetch() with apiRequest - use one pattern consistently
- **ALWAYS** include Authorization headers in ALL API calls (apiRequest handles this automatically)
- **ALWAYS** check function signatures before calling helper functions

### 12. TYPE CONVERSION FOR UI COMPONENTS
- **ALWAYS** convert numeric database fields to strings before passing to Input components
- **ALWAYS** use `String()` wrapper for potentially numeric values (zipCode, phoneNumber, capacity)
- **NEVER** assume database types match UI component prop types
- Example: `String(loc.zipCode)` instead of passing `loc.zipCode` directly

## Recent Fixes and Updates

### November 6, 2025 - Location Management Page Fix
**Problem**: "url.startsWith is not a function" error when creating/editing/deleting locations.

**Root Cause**: Incorrect usage of `apiRequest` helper function. The function signature is `apiRequest(method, url, body?, options?)` but code was calling it with wrong parameter order.

**Solution**: 
1. Fixed all location mutations to use correct apiRequest signature:
   - Create: `apiRequest('POST', '/api/locations', locationData)`
   - Update: `apiRequest('PUT', '/api/locations/${id}', locationData)`
   - Delete: `apiRequest('DELETE', '/api/locations/${id}')`
2. Removed manual object construction with `{ method: 'POST', body: ... }`

**Status**: 
- ✅ Location creation working
- ✅ Location editing working
- ✅ Location deletion working

**Lesson Learned**: Always verify helper function signatures before use. Document all helper function usage patterns in guardrails.

### November 6, 2025 - Systematic Authorization Header Fixes
**Problem**: Multiple 401 errors across the application due to missing Authorization headers in manual fetch() calls.

**Root Cause**: ~64 files using manual `fetch()` calls without Authorization headers. Only apiRequest helper automatically includes auth headers.

**Solution**: 
1. Systematically fixed 18+ fetch() calls across 8 files to include Authorization headers using `localStorage.getItem('supabase_token')`
2. Files fixed:
   - FileUploadModal.tsx, KnowledgeBase.tsx, RoleSelection.tsx
   - EducatorDailyFlowsPage.tsx, DailyFlowManagementPage.tsx
   - StudentDetailPage.tsx, SchoolClassDetailsPage.tsx, EducatorDashboard.tsx

**Status**: 
- ✅ 18 fetch() calls fixed with proper auth headers
- ⚠️ ~46 files still have manual fetch() calls requiring fixes

**Lesson Learned**: Use `apiRequest` helper consistently to avoid manual auth header management. Avoid mixing fetch() and apiRequest patterns.

### November 6, 2025 - Parent Enrollments API Fix
**Problem**: Parent dashboard showing "No active enrollments" and 401 errors when loading enrollments.

**Root Cause**: Frontend was calling `/api/enrollments` which only exists for school admins at `/api/school-admin/enrollments`. Parents had no dedicated enrollments endpoint.

**Solution**: 
1. Created `/api/parent/enrollments` endpoint in `server/api/parent.ts`
2. Updated all parent-facing pages to use correct endpoint:
   - `client/src/components/dashboards/ParentDashboard.tsx` 
   - `client/src/contexts/CartContext.tsx` (2 locations)
   - `client/src/pages/ParentDashboard.tsx`

**Status**: 
- ✅ Parent enrollments now loading successfully
- ✅ Dashboard displays enrollment counts correctly
- ✅ Cart properly checks existing enrollments

**Technical Details**:
- Endpoint filters all enrollments by `parentEmail` field
- Uses `jwtCheck` middleware for Auth0 authentication
- Returns full enrollment objects with payment status, cost, and plan details

### November 5, 2025 - School ID Registration Fix
**Problem**: Parent registrations were not setting `school_id` in Supabase auth.users table, causing "No school association found" errors.

**Root Cause**: In `server/api/auth.ts`, the Supabase user creation was missing `school_id` in `user_metadata`.

**Solution**: Added `school_id: schoolId || null` to Supabase user_metadata (line 141 in auth.ts).

**Status**: 
- ✅ NEW registrations now correctly set school_id
- ⚠️ EXISTING users with NULL school_id need manual backfill
- 📝 Default school: American Seekers Academy (schoolId: 1)

**Next Steps for Existing Users**: Update auth.users table to set school_id = 1 for existing parents.

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