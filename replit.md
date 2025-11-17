# ASA Learning Platform

## Overview
The ASA Learning Platform is an adaptive learning application for the American Seekers Academy. It offers a comprehensive and engaging educational experience by integrating full-stack web architecture with AI-powered content generation and assessment tools. The platform aims to provide personalized learning paths, efficient administrative tools, and a secure, user-friendly learning environment tailored for diverse educational needs, with a vision for significant market impact in adaptive learning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The platform prioritizes scalability, security, and user experience through a modern web application architecture, including role-based access control, AI-driven content generation, a comprehensive payment system, and multi-tenant security for data isolation.

### Frontend
-   **Framework**: React with TypeScript (Vite).
-   **UI**: Shadcn/ui (Radix UI) and Tailwind CSS for a professional, intuitive, and responsive design with a mobile-first approach.
-   **State Management**: React hooks and context.

### Backend
-   **Runtime**: Node.js with Express.
-   **Language**: TypeScript with ESM modules.
-   **API Design**: RESTful JSON API.
-   **Authentication Middleware**: Supabase-only authentication using `supabaseAuth` middleware.

### Authentication Standards
The platform uses Supabase-only authentication. All protected API endpoints must use `supabaseAuth` middleware and extract user email from `req.user.email`.

### Currency Formatting Standards
All currency values are stored and transmitted as raw cents by the backend. The frontend formats these amounts using `CurrencyUtils` helpers from `shared/currency-utils.ts` for display and calculations.

### Data Storage
-   **Primary Database**: Neon PostgreSQL for all application data.
-   **File Storage**: Local filesystem for general files and knowledge bases.
-   **Authentication Integration**: Frontend uses Supabase OAuth; backend queries Supabase for user/school data.
-   **Storage Architecture**: Hybrid system routing operations between persistent database storage and in-memory storage.

### Key Features
-   **Authentication and Authorization**: Supabase-based secure authentication with role-based access control, JWT validation, multi-tenant security, and user metadata auto-sync. Includes robust user creation and password reset flows.
-   **School Branding System**: Allows school administrators to upload and display school logos.
-   **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
-   **Payment System**: Stripe-only system with subscription schedules, webhooks, smart cart logic, and automated refunds.
-   **Cart System**: TanStack Query-based cart implementation with API-first state management to prevent localStorage/cache conflicts. **Cart Hydration Contract**: Authenticated parents skip localStorage hydration and use API as single source of truth; guest users rely on localStorage. Cart loading is gated on `activeRole === 'parent'` to prevent premature fetching during auth initialization. The `cartHydrated` flag tracks when cart is loaded from API; CartCheckout blocks payment intent creation until this flag is `true`, eliminating race conditions. Query key `['/api/parent/enrollments']` is standardized across CartContext and ParentDashboard to share cache and minimize network traffic. `refreshCart()` is async and returns a Promise to ensure fresh data before navigation. **Race Condition Fixes**: (1) 500ms delay before cart refresh after enrollment creation prevents items from disappearing due to backend processing lag. (2) `LOAD_EMPTY_CART` action ensures `cartHydrated` is set even when API returns no enrollments, preventing checkout from spinning forever. **Cart Clearing**: Bulk cancel endpoint (`POST /api/program-enrollments/cancel-multiple`) uses Drizzle ORM transactions with single atomic DELETE operation to ensure all-or-nothing cancellation of cart enrollments.
-   **Discount Systems**: Database-managed Free After Threshold Discount System, configurable by school administrators.
-   **Enrollment Management**: Robust system preventing duplicate enrollments, managing clear status workflows, and integrated with the cart-to-checkout flow. **Bulk Cancellation**: Atomic transaction-based bulk cancel endpoint with security validation (ownership verification, pending_payment status requirement) prevents partial cancellations and ensures financial data integrity.
-   **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing, enforcing strict school isolation.
-   **Registration Flow**: Two-tier registration with school code validation and duplicate prevention.
-   **AI Enrollment Assistant**: Provides personalized AI guidance for enrollment.
-   **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
-   **User Account Management**: School administrators can send account invites and password reset emails.
-   **Welcome Email System**: Automated, professional HTML welcome emails for new registrants.
-   **Parent Profile Management**: Parent users can update their profile information. School administrators can view comprehensive parent profiles with strict multi-tenant data isolation ensuring no cross-school data leakage.
-   **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
-   **Product Order Form System**: Enhanced schema supporting variant configurations, descriptions, and dynamic pricing.
-   **Parent Class Details Page**: Dedicated full-page view for class details.
-   **Edit Child Profile Page**: Dedicated page for editing child profiles.
-   **Responsive UI Patterns**: Consistent mobile-responsive patterns across all admin pages.
-   **Student Management System**: Comprehensive system for tracking and displaying students across schools, including auto-sync for existing children and automatic record creation for enrollments.
-   **Notification System**: In-app notification system with PostgreSQL storage, real-time unread count, and mark-as-read functionality.
-   **Enrollment Count Display**: Class enrollment counts accurately reflect valid statuses.
-   **Category Management System**: School-level custom category system replacing hardcoded category enums, allowing administrators to create and manage categories for organizing classes.

## Testing & Quality Assurance
-   **Integration Tests**: Comprehensive integration test suites covering user management, class management, staff management, student management, notifications, and parent profile management.
-   **Test Coverage**: Phase 1 includes 6 integration test suites with 132+ scenarios covering authentication, authorization, multi-tenant security, and feature workflows.
-   **Test Infrastructure**: Helper methods in `testDatabase.ts` for creating test data (enrollments, payments, membership enrollments).

## Known Limitations & Technical Debt
-   **Payment Schema Enhancement Required**: The payment table currently lacks `membershipEnrollmentId` field, preventing deterministic filtering of membership payments. This causes:
    -   Conservative security approach: All membership payments excluded from parent profile view to prevent cross-school data leaks
    -   Membership balances show full amount due (overstated) until schema is extended
    -   **Recommended Fix**: Add `membershipEnrollmentId` (and optionally `schoolId`) to payment schema, update Stripe webhook handlers to populate this field, and modify filtering logic to use authoritative membership links

## External Dependencies
-   **Supabase**: PostgreSQL database and OAuth authentication.
-   **Stripe**: Payment processing.
-   **Anthropic Claude API**: AI content generation and analysis.
-   **Stability AI**: Image generation.
-   **Hugging Face Inference API**: Text processing and analysis.
-   **Shadcn/ui**: React component library.
-   **Tailwind CSS**: CSS framework.
-   **Vite**: Build tool.
-   **Brevo SMTP**: Email service.
-   **SendGrid**: Email service.
-   **Twilio**: SMS service.