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
- **Category Management System**: School-level custom category system replacing hardcoded category enums. School administrators can create, edit, and manage custom categories for organizing classes. Categories table with (school_id, name) unique constraint; classes reference categories via category_id FK; database LEFT JOIN returns categoryName for display; default categories (Early Childhood, Elementary, Middle School, High School, Adult) seeded for all schools; backward compatible with legacy category strings; CRUD API endpoints at /api/school-admin/categories; frontend displays categoryName with fallback to legacy category field; class forms use dynamic category dropdown; localStorage validation prevents stale filter/sort mismatches.

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

## Development Best Practices

### State Persistence and localStorage
**Critical Guidelines for Avoiding Infinite Render Loops:**

When implementing features that use `localStorage` for state persistence (sort preferences, filter settings, column visibility, etc.), follow these practices to prevent React Error #310 (infinite render loops):

1. **Always Validate Persisted Data**
   - Before using values from `localStorage`, validate they match current schema
   - Example: When loading a saved sort field, check it exists in the current list of valid sort options
   - Invalid data should be cleared and reset to defaults with a console warning

2. **Stabilize Data with useMemo**
   - When deriving data from API responses (e.g., `classes?.items`), wrap it in `useMemo`
   - This prevents new array references on every render which trigger downstream effects
   - Example:
   ```typescript
   const classData = useMemo(() => {
     return classes?.items || fallbackData;
   }, [classes?.items]);
   ```

3. **Guard Expensive Operations During Loading**
   - Add loading state checks to prevent operations on undefined/incomplete data
   - Example in `useMemo` sorting logic:
   ```typescript
   const sorted = useMemo(() => {
     if (isLoading) return [];
     // ... sorting logic
   }, [isLoading, data, ...otherDeps]);
   ```

4. **Include All Dependencies in useMemo/useEffect**
   - Missing dependencies can cause stale closures and unexpected behavior
   - TypeScript errors about missing dependencies should not be ignored
   - Always include loading states as dependencies when they affect the operation

5. **Testing Requirements**
   - **Always test with cleared localStorage** when adding new persistent features
   - Test what happens when saved values don't match current data schema
   - Test loading states and null/undefined data scenarios
   - Verify that sort/filter operations handle missing or null field values gracefully

### Sort and Filter Implementation Checklist
When adding new sortable columns or filterable fields:

- [ ] Add field to validation array in localStorage loading logic
- [ ] Handle null/undefined values in sort comparison (use fallback values like `'zzz'` for text, `Number.POSITIVE_INFINITY` for dates)
- [ ] Update TypeScript types for column visibility toggles
- [ ] Test with localStorage containing old/invalid field names
- [ ] Ensure useMemo dependencies include loading states
- [ ] Add proper TypeScript typing (avoid `any` types in filter arrays)

### Common Pitfalls
1. **Unstable Array References**: `data?.items || fallbackArray` creates new references - use `useMemo`
2. **Missing Loading Guards**: Operations on loading data can create render loops
3. **Unvalidated localStorage**: Saved values from old schema versions can crash the app
4. **Missing Dependencies**: `useMemo` with incomplete dependency arrays causes stale data
5. **Type Errors Ignored**: TypeScript errors often indicate real runtime issues

### Real-World Example: Location Dropdown Bug (Nov 2024)
**Issue**: Adding "location" as a sortable column caused infinite render loop (React Error #310)
**Root Cause**: 
- `classData` was recalculated every render without `useMemo`
- Sort logic ran during loading state
- No validation for localStorage values

**Fix Applied**:
1. Wrapped `classData` in `useMemo` to stabilize reference
2. Added loading guard to sort `useMemo`
3. Validated saved `sortField` against whitelist of valid fields
4. Added `isLoading` to `useMemo` dependencies
5. Properly typed the `toggleColumn` function

This demonstrates why all five guidelines above are critical for preventing production bugs.