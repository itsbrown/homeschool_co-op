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
- **Membership Management System**: Admin interface for managing annual membership fees and enrollment validation.
- **Payment System**: Stripe-only payment system featuring subscription schedules, webhooks, smart cart logic, date-driven payment plans, and automated refund processing.
- **Class Management**: School administrators can create, edit, and manage classes with multi-variant pricing. All class CRUD operations enforce strict school isolation.
- **Registration Flow**: Automated account creation, handling existing accounts, and auto-login.
- **AI Enrollment Assistant**: Personalized AI guidance for enrollment.
- **Staff Management & Invitation System**: Automated onboarding, secure token-based invitations, and dynamic position management.
- **User Account Management**: School administrators can send account invites and password reset emails.
- **Password Reset System**: Email-based password reset with secure token handling.
- **Email Service**: Dual integration with Brevo SMTP and SendGrid.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, and AI-powered content analysis/generation.
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis, Stability AI for image generation, and Hugging Face for text processing.
- **Product Order Form System**: Enhanced schema with 'product' field type supporting variant configurations, descriptions, and dynamic pricing, including pre-built templates and a form builder UI.

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