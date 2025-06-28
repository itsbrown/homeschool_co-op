# ASA Learning Platform

## Overview

The ASA Learning Platform is a comprehensive adaptive learning application designed for American Seekers Academy. It serves as an educational platform that supports multiple user roles including parents, educators, school administrators, and students. The platform combines traditional full-stack web architecture with AI-powered content generation capabilities and educational assessment tools.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **State Management**: React hooks and context for application state
- **Authentication**: Auth0 integration for secure user management

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints with JSON responses
- **File Handling**: Multer for file uploads and processing
- **Authentication Middleware**: Auth0 JWT validation with bypass option for development

### Data Storage Solutions
- **Primary Database**: Supabase (PostgreSQL-based) for user data, schools, and content management
- **File Storage**: Local filesystem with organized directory structure
- **Knowledge Base Storage**: File-based system in organized folders
- **Image Processing**: SVG generation for coloring pages and educational content

## Key Components

### Authentication and Authorization
- Auth0 integration for secure authentication
- Role-based access control (parent, educator, school_admin, platform_admin)
- JWT token validation with development bypass capability
- User profile management with custom metadata

### Content Management System
- Knowledge base creation and management
- File upload and processing capabilities
- AI-powered content analysis and generation
- Educational activity creation (coloring pages, worksheets)

### AI Integration Services
- **Anthropic Claude**: Content analysis, curriculum generation, and educational insights
- **Stability AI**: Image generation for coloring pages and visual content
- **Hugging Face**: Alternative text processing and analysis capabilities

### Educational Tools
- Professional coloring page generator with age-appropriate content
- Activity generator for various educational subjects
- Curriculum and lesson plan creation tools
- Student work analysis and feedback systems

## Data Flow

1. **User Authentication**: Users authenticate through Auth0, receiving JWT tokens
2. **Content Upload**: Educators upload educational materials through the file upload system
3. **AI Processing**: Content is analyzed using AI services for educational value assessment
4. **Activity Generation**: AI-powered tools create educational activities based on content
5. **User Access**: Role-based access controls determine what content users can view and modify
6. **Data Persistence**: All user data, content, and generated materials are stored in Supabase

## External Dependencies

### Authentication Services
- **Auth0**: Primary authentication provider with custom login pages
- Domain: dev-pkx1cznpsy1gl0kp.us.auth0.com
- Supports both frontend and backend authentication flows

### AI and ML Services
- **Anthropic Claude API**: Content generation and analysis
- **Stability AI**: Image generation for educational materials
- **Hugging Face Inference API**: Text processing and analysis

### Database and Storage
- **Supabase**: PostgreSQL database with real-time capabilities
- Row Level Security (RLS) policies for data protection
- Service role access for administrative operations

### UI and Development Tools
- **Shadcn/ui**: Modern React component library
- **Tailwind CSS**: Utility-first CSS framework
- **Vite**: Fast build tool and development server

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Node.js 20 runtime
- **Database**: PostgreSQL 16 module
- **Port Configuration**: Application runs on port 5000
- **Environment Variables**: Configured for Auth0, Supabase, and AI services

### Production Build Process
1. Frontend build using Vite
2. Backend compilation with esbuild
3. Static file serving through Express
4. Autoscale deployment target on Replit

### Environment Configuration
- Development mode with authentication bypass option
- Separate configuration for frontend (VITE_) and backend environment variables
- Secure storage of API keys and sensitive credentials

## Recent Changes

### June 28, 2025 - Production Security Hardening
- **CRITICAL**: Removed development authentication bypasses from auth middleware
- Eliminated hardcoded fallback users that posed security vulnerabilities
- Secured authentication to require valid Supabase tokens in all environments
- Completed single child registration workflow testing and validation
- All core features tested and production-ready

### Previous Updates
- June 24, 2025: Initial setup
- AI content generation fully implemented with Stability AI integration
- Color inversion issue resolved for proper coloring page generation
- Multi-role authentication system with Supabase integration
- Complete registration and payment processing workflows

## Security Status
- Authentication: Production-ready with mandatory token validation
- Development bypasses: REMOVED for production deployment
- Role-based access: Fully implemented and secured

## User Preferences

Preferred communication style: Simple, everyday language.