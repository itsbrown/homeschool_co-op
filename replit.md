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
- **Staff Invitation System**: Complete automated staff onboarding with secure token-based invitations (7-day expiration), automatic Supabase account creation, temporary password generation, professional email notifications, and seamless resend functionality for individual and bulk operations.
- **Staff Management**: Dynamic staff position management with school-specific roles, comprehensive staff editing with data persistence, and role synchronization between invitation and edit forms.
- **Content Management System**: Creation and management of knowledge bases, file upload/processing, AI-powered content analysis and generation (e.g., coloring pages, worksheets).
- **AI Integration Services**: Utilizes Anthropic Claude for content analysis and curriculum generation, Stability AI for image generation, and Hugging Face for text processing.
- **Educational Tools**: Generators for professional coloring pages and various educational activities, curriculum/lesson plan creation, and student work analysis.
- **Data Flow**: Secure user authentication via Auth0, AI-driven content processing post-upload, activity generation, role-based content access, and persistence in Supabase.
- **UI/UX Decisions**: Focus on a professional and intuitive user experience with clear navigation, dynamic updates, and consistent design. Examples include consolidated navigation, simplified page structures, and clear payment plan selections.

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