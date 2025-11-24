# ASA Learning Platform - Software Design Document (SDD)

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Current System Architecture](#current-system-architecture)
3. [Future System Architecture (AI + Blockchain)](#future-system-architecture-ai--blockchain)
4. [Component Design](#component-design)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Security Architecture](#security-architecture)
7. [Integration Patterns](#integration-patterns)
8. [Scalability & Performance](#scalability--performance)
9. [Error Handling & Resilience](#error-handling--resilience)
10. [Deployment Architecture](#deployment-architecture)

---

## System Architecture Overview

### Architectural Principles

**1. Database as Source of Truth**
- PostgreSQL is the authoritative data store
- All application state persists in the database
- Supabase used ONLY for authentication, NOT general data persistence
- Drizzle ORM provides type-safe database access

**2. Multi-Tenant Security**
- Complete data isolation between schools
- School ID required for all school-scoped operations
- Row-level filtering enforced at query level
- Cross-school data access prevented by design

**3. Type Safety**
- TypeScript used throughout (frontend and backend)
- Shared schema definitions between client and server
- Drizzle-Zod for runtime validation
- Express middleware typed correctly

**4. API-First Design**
- RESTful JSON API
- Frontend never directly accesses database
- Backend validates all requests
- Clear separation of concerns

**5. Modular Architecture**
- Feature-based code organization
- Reusable components
- Dependency injection where appropriate
- Clear interfaces between modules

### Technology Stack Summary

**Frontend:**
- React 18
- TypeScript
- Vite (build tool)
- TanStack Query (data fetching)
- Wouter (routing)
- Shadcn/UI + Radix UI (components)
- Tailwind CSS (styling)

**Backend:**
- Node.js
- Express
- TypeScript with ESM modules
- Drizzle ORM
- Supabase (auth only)
- JWT validation

**Database:**
- PostgreSQL 15+ (Neon-hosted)
- Drizzle migrations
- Full ACID compliance

**External Services:**
- Supabase: Authentication
- Stripe: Payment processing
- Anthropic: AI (Claude)
- Stability AI: Image generation
- Hugging Face: NLP models
- Brevo/SendGrid: Email
- Twilio: SMS
- Thirdweb/Alchemy: Blockchain (planned)
- Magic Link: Wallets (planned)

---

## Current System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              React SPA (TypeScript)                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │  Pages   │  │Components│  │   TanStack Query     │ │ │
│  │  │ (Wouter) │  │(Shadcn)  │  │ (API State Mgmt)     │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │         Contexts (Role, Auth, Theme)             │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                         API LAYER                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Express Server (TypeScript)                  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │                 Middleware                        │  │ │
│  │  │  - supabaseAuth (JWT validation)                 │  │ │
│  │  │  - requireRole (RBAC)                            │  │ │
│  │  │  - requireSchoolContext (multi-tenant)           │  │ │
│  │  │  - error handling                                │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │                API Routes                         │  │ │
│  │  │  /api/auth        /api/stripe                    │  │ │
│  │  │  /api/classes     /api/enrollments               │  │ │
│  │  │  /api/school-admin   /api/parent                 │  │ │
│  │  │  /api/ai          /api/notifications             │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Drizzle ORM                                │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Schema (shared/schema.ts)                       │  │ │
│  │  │  - Type-safe models                              │  │ │
│  │  │  - Zod validation schemas                        │  │ │
│  │  │  - Relationships                                 │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        PostgreSQL Database (Neon)                      │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Tables: users, schools, classes, enrollments,   │  │ │
│  │  │  children, memberships, payments, etc.           │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Supabase │  │  Stripe  │  │Anthropic │  │Stability │   │
│  │  (Auth)  │  │(Payment) │  │   (AI)   │  │   AI     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │  Brevo   │  │ SendGrid │  │  Twilio  │                 │
│  │ (Email)  │  │ (Email)  │  │  (SMS)   │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

**1. User Authentication Flow:**
```
User enters credentials
    ↓
Frontend → Supabase Auth API
    ↓
Supabase validates credentials
    ↓
JWT token returned to frontend
    ↓
Frontend stores token in memory
    ↓
Frontend includes token in API requests (Authorization header)
    ↓
Backend → supabaseAuth middleware validates JWT
    ↓
Backend queries PostgreSQL for user details
    ↓
Request proceeds with req.user populated
```

**2. Multi-Tenant Data Access Flow:**
```
Admin views school dashboard
    ↓
Frontend → GET /api/school-admin/my-school
    ↓
Backend → supabaseAuth (validates user)
    ↓
Backend → requireRole(['schoolAdmin'])
    ↓
Backend → requireSchoolContext (extracts schoolId)
    ↓
Backend queries database WITH school_id filter
    ↓
Returns ONLY data belonging to admin's school
    ↓
Frontend receives and displays data
```

**3. Payment Processing Flow:**
```
Parent adds classes to cart
    ↓
Frontend → GET /api/cart (load cart)
    ↓
Parent proceeds to checkout
    ↓
Frontend → POST /api/stripe/create-checkout-session
    ↓
Backend creates Stripe Checkout session
    ↓
Frontend redirects to Stripe Checkout
    ↓
User completes payment on Stripe
    ↓
Stripe → Webhook → POST /api/stripe/webhook
    ↓
Backend verifies webhook signature
    ↓
Backend updates enrollment statuses in database
    ↓
Backend sends confirmation email
    ↓
User redirected to success page
```

### Directory Structure

```
asa-learning-platform/
├── client/                          # Frontend application
│   ├── public/                      # Static assets
│   └── src/
│       ├── components/              # React components
│       │   ├── ui/                  # Shadcn UI components
│       │   ├── layout/              # Layout components
│       │   └── features/            # Feature-specific components
│       ├── contexts/                # React contexts
│       │   ├── RoleContext.tsx      # Multi-role management
│       │   ├── AuthContext.tsx      # Authentication state
│       │   └── ThemeContext.tsx     # Dark mode
│       ├── hooks/                   # Custom React hooks
│       ├── lib/                     # Utilities
│       │   ├── queryClient.ts       # TanStack Query config
│       │   └── utils.ts             # Helper functions
│       ├── pages/                   # Page components (Wouter routes)
│       │   ├── auth/                # Login, register, etc.
│       │   ├── admin/               # School admin pages
│       │   ├── parent/              # Parent dashboard pages
│       │   └── public/              # Public pages
│       ├── App.tsx                  # Main app component
│       ├── index.css                # Global styles
│       └── main.tsx                 # Entry point
│
├── server/                          # Backend application
│   ├── api/                         # API route handlers
│   │   ├── auth.ts                  # Authentication endpoints
│   │   ├── school-admin.ts          # School admin endpoints
│   │   ├── parent.ts                # Parent endpoints
│   │   ├── stripe.ts                # Payment endpoints
│   │   ├── classes.ts               # Class management
│   │   ├── enrollments.ts           # Enrollment management
│   │   ├── ai.ts                    # AI features
│   │   └── notifications.ts         # Notification system
│   ├── middleware/                  # Express middleware
│   │   ├── auth0-auth.ts            # Supabase auth middleware
│   │   ├── types.ts                 # Type augmentation
│   │   └── error.ts                 # Error handling
│   ├── services/                    # Business logic
│   │   ├── UserSyncService.ts       # User data sync
│   │   ├── EmailService.ts          # Email operations
│   │   ├── AIService.ts             # AI integrations
│   │   └── StripeService.ts         # Stripe operations
│   ├── config/                      # Configuration
│   │   ├── database.ts              # Database connection
│   │   ├── supabase.ts              # Supabase admin client
│   │   └── stripe.ts                # Stripe client
│   ├── routes.ts                    # API route registration
│   ├── index.ts                     # Server entry point
│   └── vite.ts                      # Vite integration
│
├── shared/                          # Shared between client and server
│   └── schema.ts                    # Database schema (Drizzle)
│
├── docs/                            # Documentation
├── attached_assets/                 # User-uploaded assets
├── db/                              # Database migrations
│   └── migrations/                  # Drizzle migrations
├── tests/                           # Test suites
├── drizzle.config.ts                # Drizzle configuration
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite configuration
└── package.json                     # Dependencies
```

---

## Future System Architecture (AI + Blockchain)

### Enhanced Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              React SPA (TypeScript)                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │  Pages   │  │Components│  │   TanStack Query     │ │ │
│  │  │ (Wouter) │  │(Shadcn)  │  │                      │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │         NEW: AI Co-Admin Chat Interface         │  │ │
│  │  │         NEW: NFT Gallery                        │  │ │
│  │  │         NEW: Credit Dashboard                   │  │ │
│  │  │         NEW: Wallet Management UI               │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                         API LAYER                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Express Server (TypeScript)                  │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │              NEW API ROUTES                      │   │ │
│  │  │  /api/ai-co-admin/*    (AI orchestration)       │   │ │
│  │  │  /api/credits/*        (Credit management)      │   │ │
│  │  │  /api/referrals/*      (Referral tracking)      │   │ │
│  │  │  /api/nft/*            (NFT operations)         │   │ │
│  │  │  /api/wallet/*         (Wallet management)      │   │ │
│  │  │  /api/token/*          (Crypto operations)      │   │ │
│  │  │  /api/students/:id/credits/* (Student credits)  │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │         NEW: AI Co-Admin Service Layer          │   │ │
│  │  │  ┌────────────────────────────────────────┐     │   │ │
│  │  │  │  AI Orchestration Engine               │     │   │ │
│  │  │  │  - Intent Parser                       │     │   │ │
│  │  │  │  - Context Manager                     │     │   │ │
│  │  │  │  - Task Planner                        │     │   │ │
│  │  │  │  - Approval Workflow                   │     │   │ │
│  │  │  │  - Execution Engine                    │     │   │ │
│  │  │  └────────────────────────────────────────┘     │   │ │
│  │  │  ┌────────────────────────────────────────┐     │   │ │
│  │  │  │  Specialized AI Agents                 │     │   │ │
│  │  │  │  - Analyst Agent                       │     │   │ │
│  │  │  │  - Creator Agent                       │     │   │ │
│  │  │  │  - Operations Agent                    │     │   │ │
│  │  │  │  - Relationship Agent                  │     │   │ │
│  │  │  │  - Financial Agent                     │     │   │ │
│  │  │  └────────────────────────────────────────┘     │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │      NEW: Blockchain Integration Layer          │   │ │
│  │  │  - NFT Minting Service                          │   │ │
│  │  │  - Wallet Service (Magic Link)                  │   │ │
│  │  │  - Token Conversion Service                     │   │ │
│  │  │  - Smart Contract Interaction                   │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE LAYER (PostgreSQL)                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              EXISTING TABLES                        │    │
│  │  users, schools, classes, enrollments, children,    │    │
│  │  memberships, payments, notifications, etc.         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              NEW TABLES                             │    │
│  │  ┌────────────────────────────────────────────┐     │    │
│  │  │  Phase 1: Credit System                    │     │    │
│  │  │  - credit_ledger                           │     │    │
│  │  │  - user_credits                            │     │    │
│  │  │  - referral_tracking                       │     │    │
│  │  │  - marketing_pieces                        │     │    │
│  │  │  - credit_transactions                     │     │    │
│  │  └────────────────────────────────────────────┘     │    │
│  │  ┌────────────────────────────────────────────┐     │    │
│  │  │  Phase 2: AI & Student Credits             │     │    │
│  │  │  - ai_conversations                        │     │    │
│  │  │  - ai_conversation_messages                │     │    │
│  │  │  - ai_tasks                                │     │    │
│  │  │  - ai_insights                             │     │    │
│  │  │  - student_credits                         │     │    │
│  │  │  - student_achievements                    │     │    │
│  │  └────────────────────────────────────────────┘     │    │
│  │  ┌────────────────────────────────────────────┐     │    │
│  │  │  Phase 3: NFT & Crypto                     │     │    │
│  │  │  - nft_badges                              │     │    │
│  │  │  - nft_collections                         │     │    │
│  │  │  - student_wallets                         │     │    │
│  │  │  - crypto_conversions                      │     │    │
│  │  │  - asa_token_transactions                  │     │    │
│  │  └────────────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  EXISTING SERVICES                                   │   │
│  │  Supabase, Stripe, Anthropic, Stability AI,         │   │
│  │  Hugging Face, Brevo, SendGrid, Twilio              │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NEW SERVICES                                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │Thirdweb/ │  │  Magic   │  │ Polygon  │          │   │
│  │  │ Alchemy  │  │   Link   │  │   RPC    │          │   │
│  │  │  (NFTs)  │  │(Wallets) │  │(Blockchain)         │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  │  ┌──────────┐  ┌──────────┐                        │   │
│  │  │  IPFS    │  │   DEX    │                        │   │
│  │  │(Pinata)  │  │(Uniswap) │                        │   │
│  │  └──────────┘  └──────────┘                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   BLOCKCHAIN LAYER                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Polygon Network                            │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Smart Contracts                                  │  │ │
│  │  │  - ASABadgeNFT (ERC-721)                         │  │ │
│  │  │  - ASAToken (ERC-20)                             │  │ │
│  │  │  - ASAStaking (Staking rewards)                  │  │ │
│  │  │  - ASAGovernance (DAO voting)                    │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### AI Co-Admin Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  AI Co-Admin System                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Frontend Chat Interface                   │  │
│  │  - Natural language input                          │  │
│  │  - Conversation history                            │  │
│  │  - Task preview cards                              │  │
│  │  - Approval/rejection buttons                      │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │         API: /api/ai-co-admin/chat                  │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Intent Parser                          │  │
│  │  - Analyzes user message                           │  │
│  │  - Detects intent (create_discount, send_email)   │  │
│  │  - Extracts parameters                             │  │
│  │  - Asks clarifying questions                       │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Context Manager                          │  │
│  │  - Maintains conversation state                    │  │
│  │  - Stores in database (ai_conversations)           │  │
│  │  - Retrieves historical context                    │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Task Planner                           │  │
│  │  - Breaks complex requests into tasks             │  │
│  │  - Determines execution order                      │  │
│  │  - Identifies dependencies                         │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Approval Workflow                         │  │
│  │  - Determines if approval needed                   │  │
│  │  - Creates task record (ai_tasks)                  │  │
│  │  - Notifies user for approval                      │  │
│  │  - Waits for user response                         │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Agent Registry                           │  │
│  │  - Routes task to specialized agent                │  │
│  │  - Manages agent instances                         │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Specialized Agents                          │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Analyst Agent                               │  │  │
│  │  │  - Query database for metrics                │  │  │
│  │  │  - Detect anomalies                          │  │  │
│  │  │  - Generate insights                         │  │  │
│  │  │  - Create daily brief                        │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Creator Agent                               │  │  │
│  │  │  - Generate marketing copy                   │  │  │
│  │  │  - Create visual assets (Stability AI)      │  │  │
│  │  │  - Design email templates                    │  │  │
│  │  │  - Write class descriptions                  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Operations Agent                            │  │  │
│  │  │  - Create discounts                          │  │  │
│  │  │  - Modify classes                            │  │  │
│  │  │  - Update settings                           │  │  │
│  │  │  - Execute bulk operations                   │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Relationship Agent                          │  │  │
│  │  │  - Send emails                               │  │  │
│  │  │  - Create notifications                      │  │  │
│  │  │  - Schedule follow-ups                       │  │  │
│  │  │  - Manage communications                     │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Financial Agent                             │  │  │
│  │  │  - Optimize pricing                          │  │  │
│  │  │  - Predict revenue                           │  │  │
│  │  │  - Manage credit rules                       │  │  │
│  │  │  - Process refunds                           │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Execution Engine                          │  │
│  │  - Executes approved tasks                         │  │
│  │  - Calls appropriate APIs                          │  │
│  │  - Updates database                                │  │
│  │  - Handles errors                                  │  │
│  │  - Logs results                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Response Generator                     │  │
│  │  - Formats results for user                        │  │
│  │  - Creates confirmation message                    │  │
│  │  - Suggests next actions                           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Blockchain Integration Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Blockchain Layer                         │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Frontend Wallet Interface                │  │
│  │  - Magic Link integration                          │  │
│  │  - NFT gallery                                     │  │
│  │  - Token balance display                           │  │
│  │  - Transaction history                             │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Backend Blockchain Services                 │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  NFT Minting Service                         │  │  │
│  │  │  - Detect achievement                        │  │  │
│  │  │  - Generate badge artwork (Stability AI)    │  │  │
│  │  │  - Package metadata (JSON)                  │  │  │
│  │  │  - Upload to IPFS via Thirdweb              │  │  │
│  │  │  - Mint NFT to student wallet               │  │  │
│  │  │  - Update database with token ID            │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Wallet Service                              │  │  │
│  │  │  - Create Magic Link wallet                 │  │  │
│  │  │  - Manage wallet keys (delegated)           │  │  │
│  │  │  - Query wallet balance                     │  │  │
│  │  │  - Unlock at graduation                     │  │  │
│  │  │  - Transfer control to student              │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Token Conversion Service                    │  │  │
│  │  │  - Convert credits to tokens                │  │  │
│  │  │  - Execute token transfers                  │  │  │
│  │  │  - Track conversion rate                    │  │  │
│  │  │  - Process tuition payments in tokens      │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Smart Contract Interaction                  │  │  │
│  │  │  - Call contract methods                    │  │  │
│  │  │  - Listen to contract events                │  │  │
│  │  │  - Handle transaction confirmations         │  │  │
│  │  │  - Manage gas fees (sponsor for users)     │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Thirdweb SDK / Alchemy SDK                  │  │
│  │  - Abstracts blockchain complexity                 │  │
│  │  - Provides gasless transactions                   │  │
│  │  - Manages smart contract ABIs                     │  │
│  │  - IPFS storage integration                        │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Polygon Network                        │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Smart Contracts (Solidity)                  │  │  │
│  │  │                                               │  │  │
│  │  │  ASABadgeNFT (ERC-721):                      │  │  │
│  │  │  - mintBadge(address, tokenURI, achievementId)│ │
│  │  │  - transferBadge(from, to, tokenId)          │  │  │
│  │  │  - unlockTransfers(tokenId)                  │  │  │
│  │  │  - getBadgeMetadata(tokenId)                 │  │  │
│  │  │                                               │  │  │
│  │  │  ASAToken (ERC-20):                          │  │  │
│  │  │  - convertCredits(recipient, amount)         │  │  │
│  │  │  - payTuition(amount, schoolId, studentId)   │  │  │
│  │  │  - stake(amount)                             │  │  │
│  │  │  - unstake(amount)                           │  │  │
│  │  │  - transfer(to, amount)                      │  │  │
│  │  │                                               │  │  │
│  │  │  ASAStaking:                                 │  │  │
│  │  │  - stake(amount)                             │  │  │
│  │  │  - calculateRewards(address)                 │  │  │
│  │  │  - claimRewards()                            │  │  │
│  │  │                                               │  │  │
│  │  │  ASAGovernance:                              │  │  │
│  │  │  - createProposal(description, actions)      │  │  │
│  │  │  - vote(proposalId, support)                 │  │  │
│  │  │  - executeProposal(proposalId)               │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▼                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              IPFS Storage (Pinata)                  │  │
│  │  - NFT metadata JSON files                         │  │
│  │  - NFT image assets                                │  │
│  │  - Permanent, immutable storage                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Component Design

### Frontend Component Architecture

**Component Hierarchy:**
```
App
├── AuthProvider
│   ├── RoleProvider
│   │   ├── ThemeProvider
│   │   │   ├── QueryClientProvider
│   │   │   │   ├── Router (Wouter)
│   │   │   │   │   ├── PublicRoutes
│   │   │   │   │   │   ├── LandingPage
│   │   │   │   │   │   ├── LoginPage
│   │   │   │   │   │   └── RegisterPage
│   │   │   │   │   ├── ParentRoutes (protected)
│   │   │   │   │   │   ├── ParentDashboard
│   │   │   │   │   │   ├── CreditDashboard (new)
│   │   │   │   │   │   ├── MarketingHub (new)
│   │   │   │   │   │   ├── ClassCatalog
│   │   │   │   │   │   ├── EnrollmentHistory
│   │   │   │   │   │   └── StudentWalletView (new)
│   │   │   │   │   ├── AdminRoutes (protected)
│   │   │   │   │   │   ├── SchoolDashboard
│   │   │   │   │   │   ├── AICoAdminChat (new)
│   │   │   │   │   │   ├── ClassManagement
│   │   │   │   │   │   ├── UserManagement
│   │   │   │   │   │   └── Analytics
│   │   │   │   │   ├── StudentRoutes (protected, new)
│   │   │   │   │   │   ├── StudentPortal
│   │   │   │   │   │   ├── QuestDashboard
│   │   │   │   │   │   ├── NFTGallery
│   │   │   │   │   │   └── Leaderboard
│   │   │   │   │   └── SharedComponents
│   │   │   │   │       ├── Navigation
│   │   │   │   │       ├── RoleSwitcher
│   │   │   │   │       └── NotificationBell
│   │   │   │   └── Toaster
```

**Key Component Patterns:**

**1. Server State Management (TanStack Query):**
```typescript
// Example: Credit balance query
export function useCreditBalance() {
  return useQuery({
    queryKey: ['/api/credits/balance'],
    enabled: !!user, // Only run if user authenticated
  });
}

// Example: Credit redemption mutation
export function useRedeemCredits() {
  return useMutation({
    mutationFn: async (data: RedeemCreditsInput) => 
      apiRequest('/api/credits/redeem', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/history'] });
      toast({ title: 'Credits redeemed successfully!' });
    },
  });
}
```

**2. Multi-Role Context Pattern:**
```typescript
// RoleContext manages active role switching
const RoleContext = createContext<RoleContextValue>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  
  // Fetch user roles from API
  const { data: roles } = useQuery({ queryKey: ['/api/user-roles'] });
  
  const switchRole = async (newRole: UserRole) => {
    // API call to switch role
    await apiRequest(`/api/user-roles/switch/${newRole.id}`, { method: 'POST' });
    setActiveRole(newRole);
  };
  
  return (
    <RoleContext.Provider value={{ activeRole, availableRoles, switchRole }}>
      {children}
    </RoleContext.Provider>
  );
}
```

**3. Protected Route Pattern:**
```typescript
function ProtectedRoute({ 
  component: Component, 
  requiredRole 
}: ProtectedRouteProps) {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const [location, setLocation] = useLocation();
  
  if (!user) {
    setLocation('/login');
    return null;
  }
  
  if (requiredRole && activeRole?.role !== requiredRole) {
    return <div>Access Denied</div>;
  }
  
  return <Component />;
}
```

### Backend API Design Patterns

**1. Middleware Chain Pattern:**
```typescript
// Standard protected endpoint pattern
router.get('/api/school-admin/classes', 
  supabaseAuth,                    // Authenticate user
  requireRole(['schoolAdmin']),    // Check role
  requireSchoolContext,            // Extract and validate schoolId
  async (req, res) => {
    const schoolId = req.user.schoolId!;
    // Query database with schoolId filter
  }
);
```

**2. Service Layer Pattern:**
```typescript
// Separation of concerns: Route → Service → Database
class CreditService {
  async awardCredits(
    userId: number, 
    actionType: string, 
    amount: number, 
    metadata: any
  ): Promise<CreditLedgerEntry> {
    // Business logic here
    const ledgerEntry = await db.insert(creditLedger).values({
      userId,
      actionType,
      amount,
      metadata,
      status: 'pending'
    }).returning();
    
    // Update user balance
    await this.updateUserBalance(userId, amount);
    
    // Check tier progression
    await this.checkTierUpgrade(userId);
    
    return ledgerEntry[0];
  }
  
  private async updateUserBalance(userId: number, amount: number) {
    // Update user_credits table
  }
  
  private async checkTierUpgrade(userId: number) {
    // Check if user qualifies for tier upgrade
  }
}
```

**3. Error Handling Pattern:**
```typescript
// Centralized error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, details: err.details });
  }
  
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (err instanceof ForbiddenError) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Default to 500 for unknown errors
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Data Flow Diagrams

### Parent Credit Earning Flow

```
Parent shares marketing piece
    ↓
Frontend → POST /api/marketing-hub/share
    {
      pieceId: 123,
      platform: 'facebook',
      trackingCode: 'ABC123'
    }
    ↓
Backend validates request
    ↓
Generate unique tracking URL
    ↓
Store share event in database
    ↓
Award $1 credit (ledger entry, status: 'pending')
    ↓
Return tracking URL to frontend
    ↓
Frontend opens share dialog
    ↓
User completes share
    ↓
Return to app
    ↓

Referred friend clicks link
    ↓
Frontend → GET /api/referrals/track-click?code=ABC123
    ↓
Backend records click
    ↓
Increment click_count
    ↓

Friend registers
    ↓
Frontend → POST /api/auth/register
    {
      ...registration data,
      referralCode: 'ABC123'
    }
    ↓
Backend creates user account
    ↓
Create referral_tracking entry
    {
      referrerId: parent's userId,
      refereeId: new user's userId,
      trackingCode: 'ABC123',
      conversionType: 'registration'
    }
    ↓
Award $20 referral credit
    ↓
Insert into credit_ledger
    {
      userId: parent's userId,
      actionType: 'referral_registration',
      amount: 20.00,
      relatedEntityId: new user's id,
      status: 'pending'
    }
    ↓
Update user_credits.pending_balance
    ↓
Send notification to parent
    ↓

After 7 days (confirmation delay):
    ↓
Background job runs
    ↓
Check if user is still active
    ↓
If yes:
    - Update ledger status: 'pending' → 'confirmed'
    - Move credits from pending to available balance
    - Send confirmation notification
If no:
    - Reverse credit (status: 'reversed')
```

### Student Achievement to NFT Flow

```
Student completes class with "Mastery" rating
    ↓
Educator marks class complete
    ↓
Frontend → POST /api/enrollments/:id/complete
    {
      enrollmentId: 456,
      rating: 'mastery'
    }
    ↓
Backend validates request
    ↓
Update enrollment status
    ↓
Trigger achievement detection
    ↓
AI Service detects achievement
    ↓
Determine credit amount ($12 for mastery)
    ↓
Apply tier multiplier (e.g., 1.5x = $18)
    ↓
Insert student_achievements record
    {
      studentId: 789,
      achievementType: 'class_complete',
      achievementName: 'Math Master',
      creditValue: 18.00,
      multiplierApplied: 1.5,
      classId: 456
    }
    ↓
Update student_credits
    - Add $18 to lifetime_earned
    - Add $18 to available_balance (locked)
    ↓
Trigger NFT minting (Phase 3)
    ↓
NFT Minting Service:
    ↓
    Generate badge artwork via Stability AI
        {
          prompt: "Achievement badge for Math Mastery, 
                   uncommon rarity, blue glowing border, 
                   school colors, professional design"
        }
    ↓
    Upload image to IPFS via Thirdweb
    ↓
    Package metadata:
        {
          name: "Math Master - Johnny Smith",
          description: "Achieved mastery in mathematics",
          image: "ipfs://Qm...",
          attributes: [
            { trait_type: "Achievement", value: "Math Master" },
            { trait_type: "Rarity", value: "Uncommon" },
            { trait_type: "Date", value: "2025-11-24" }
          ]
        }
    ↓
    Upload metadata to IPFS
    ↓
    Mint NFT to student wallet
        - Call smart contract: ASABadgeNFT.mintBadge(
            studentWalletAddress,
            metadataURI,
            achievementId
          )
    ↓
    Wait for transaction confirmation
    ↓
    Store NFT details in database:
        nft_badges table {
          studentId: 789,
          achievementId: from above,
          tokenId: "1234",
          contractAddress: "0x...",
          metadataUri: "ipfs://...",
          transactionHash: "0x..."
        }
    ↓
Send notification to student and parent
    ↓
Student views NFT in gallery
```

### AI Co-Admin Command Flow

```
Admin types: "Create a 20% discount for summer camp"
    ↓
Frontend → POST /api/ai-co-admin/chat
    {
      message: "Create a 20% discount for summer camp",
      conversationId: null
    }
    ↓
Backend receives request
    ↓
Create or retrieve conversation
    ↓
Store user message in ai_conversation_messages
    ↓
Intent Parser (Claude API):
    ↓
    Send message to Claude with system prompt:
        "You are an AI assistant for a school platform.
         Analyze the user's intent and extract parameters."
    ↓
    Claude responds:
        {
          intent: "create_discount",
          parameters: {
            type: "percentage",
            value: 20,
            applicableTo: "summer_camp_classes"
          },
          clarificationsNeeded: [
            "Which specific summer camp classes?",
            "What's the expiration date?"
          ]
        }
    ↓
If clarifications needed:
    - Return questions to user
    - Store assistant message
    - Wait for user response
    ↓
Once all parameters collected:
    ↓
Task Planner creates task
    ↓
Store in ai_tasks table:
    {
      conversationId: 123,
      taskType: 'create_discount',
      parameters: { ... },
      status: 'pending_approval',
      approvalRequired: true
    }
    ↓
Operations Agent formats preview:
    ↓
    Return to frontend:
        {
          message: "I'll create a 20% discount for Summer Camp classes,
                    expiring on July 1st. This will apply to 3 classes.
                    Projected cost: $500 in discounts if all seats fill.",
          task: {
            id: 456,
            type: 'create_discount',
            preview: { ... }
          },
          requiresApproval: true
        }
    ↓
Frontend displays preview with approve/reject buttons
    ↓
Admin clicks "Approve"
    ↓
Frontend → POST /api/ai-co-admin/task/456/approve
    ↓
Backend updates task status: 'approved'
    ↓
Execution Engine:
    ↓
    Operations Agent executes:
        - Creates discount in database
        - Applies to specified classes
        - Sets expiration date
        - Sends confirmation
    ↓
    Update task status: 'completed'
    ↓
    Store result in task record
    ↓
Send confirmation to frontend:
    ↓
    {
      message: "Done! I've created the discount.
                It's now active on 3 summer camp classes.",
      links: [
        { label: "View Discount", url: "/admin/discounts/789" }
      ]
    }
    ↓
Frontend displays success message
```

---

## Security Architecture

### Authentication & Authorization

**1. Authentication Flow:**
```
User submits login credentials
    ↓
Frontend → Supabase Auth API
    ↓
Supabase validates credentials
    ↓
JWT token issued (contains user.id as UUID)
    ↓
Frontend stores token in memory (not localStorage)
    ↓
Frontend includes token in all API requests:
    Authorization: Bearer <token>
    ↓
Backend middleware (supabaseAuth):
    ↓
    1. Extract token from header
    2. Verify signature with Supabase
    3. Decode payload
    4. Extract user.id (Supabase UUID)
    5. Query PostgreSQL:
         SELECT * FROM users WHERE supabase_id = user.id
    6. Populate req.user with database user
    7. If no database user, return 401
    8. Proceed to next middleware
```

**2. Multi-Tenant Security:**
```
Admin requests: GET /api/school-admin/classes
    ↓
supabaseAuth middleware validates user
    ↓
requireRole middleware checks role = 'schoolAdmin'
    ↓
requireSchoolContext middleware:
    ↓
    1. Query user_roles table:
         SELECT school_id FROM user_roles
         WHERE user_id = req.user.id
         AND role = 'schoolAdmin'
    ↓
    2. If no school found, return 403
    ↓
    3. Set req.user.schoolId = school_id
    ↓
Route handler executes:
    ↓
    const schoolId = req.user.schoolId;
    const classes = await db.select()
      .from(classesTable)
      .where(eq(classesTable.schoolId, schoolId));
    ↓
CRITICAL: schoolId filter ALWAYS applied
    - No cross-school data leakage
    - Complete tenant isolation
```

**3. API Key Security (External Integrations):**
```
Secrets stored in Replit environment:
    - SUPABASE_URL
    - SUPABASE_SERVICE_KEY
    - STRIPE_SECRET_KEY
    - ANTHROPIC_API_KEY
    - STABILITY_API_KEY
    - MAGIC_LINK_SECRET_KEY (planned)
    - THIRDWEB_SECRET_KEY (planned)
    ↓
Backend loads secrets via process.env
    ↓
Never exposed to frontend
    ↓
API calls made server-side only
    ↓
Rate limiting applied per service
```

### Data Security

**1. Encryption:**
- All data encrypted at rest (PostgreSQL)
- All data encrypted in transit (TLS 1.3)
- Sensitive fields (SSN, payment info) double-encrypted

**2. Input Validation:**
```typescript
// Example: Zod schema validation
const createClassSchema = insertClassSchema.extend({
  name: z.string().min(3).max(100),
  price: z.number().min(0).max(10000),
  capacity: z.number().int().min(1).max(500),
});

router.post('/api/classes', async (req, res) => {
  try {
    const validated = createClassSchema.parse(req.body);
    // Proceed with validated data
  } catch (err) {
    return res.status(400).json({ error: 'Validation failed', details: err });
  }
});
```

**3. SQL Injection Prevention:**
- Drizzle ORM handles parameterized queries
- No raw SQL strings
- All user input sanitized

**4. XSS Prevention:**
- React escapes all rendered content by default
- Dangerous HTML explicitly marked with dangerouslySetInnerHTML (used sparingly)
- Content Security Policy headers

### Blockchain Security

**1. Smart Contract Security:**
```solidity
// Example security patterns in smart contracts

contract ASABadgeNFT is ERC721 {
    address public authorizedMinter;
    mapping(uint256 => bool) public transferLocked;
    
    modifier onlyAuthorized() {
        require(msg.sender == authorizedMinter, "Not authorized");
        _;
    }
    
    // Prevent unauthorized minting
    function mintBadge(
        address studentWallet,
        string memory tokenURI,
        uint256 achievementId
    ) external onlyAuthorized {
        uint256 tokenId = _tokenIdCounter.current();
        _safeMint(studentWallet, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        // Lock transfers until graduation
        transferLocked[tokenId] = true;
    }
    
    // Prevent transfers of locked tokens
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        require(!transferLocked[tokenId], "Token locked until graduation");
        super.transferFrom(from, to, tokenId);
    }
    
    // Admin can unlock after graduation
    function unlockTransfers(uint256 tokenId) external onlyAuthorized {
        transferLocked[tokenId] = false;
    }
}
```

**2. Wallet Security:**
- Magic Link manages private keys (delegated key management)
- Multi-signature for high-value operations
- Rate limiting on minting
- Emergency pause mechanism

**3. Transaction Security:**
- Nonce management to prevent replay attacks
- Gas price limits
- Transaction value limits
- Confirmation requirements (multiple blocks)

---

## Integration Patterns

### Supabase Integration

**Pattern:**
```typescript
// Server-side Supabase admin client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // Service role key (full access)
  { auth: { persistSession: false } }
);

// Use cases:
// 1. Validate JWT tokens
// 2. Admin user operations (password resets)
// 3. NOT for general data queries (use PostgreSQL directly)
```

### Stripe Integration

**Pattern:**
```typescript
// Stripe client initialization
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

// Webhook handling
router.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature']!;
  
  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    
    // Handle event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      // ...
    }
    
    res.json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

### Anthropic AI Integration

**Pattern:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

async function callClaude(prompt: string, context?: any) {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Context: ${JSON.stringify(context)}\n\nUser request: ${prompt}`
      }
    ]
  });
  
  return message.content[0].text;
}

// Usage in AI Co-Admin
async function parseIntent(userMessage: string, conversationHistory: any[]) {
  const prompt = `
    You are an AI assistant for a school management platform.
    Analyze the user's message and determine their intent.
    
    Conversation history: ${JSON.stringify(conversationHistory)}
    Latest message: "${userMessage}"
    
    Respond with JSON:
    {
      "intent": "create_discount | send_email | create_class | ...",
      "parameters": { ... },
      "clarificationsNeeded": [ ... ]
    }
  `;
  
  const response = await callClaude(prompt);
  return JSON.parse(response);
}
```

### Thirdweb Integration (Planned)

**Pattern:**
```typescript
import { ThirdwebSDK } from "@thirdweb-dev/sdk";

// Initialize SDK
const sdk = ThirdwebSDK.fromPrivateKey(
  process.env.THIRDWEB_PRIVATE_KEY!,
  "polygon" // Chain
);

// Get NFT collection contract
const nftCollection = await sdk.getContract(
  process.env.NFT_CONTRACT_ADDRESS!,
  "nft-collection"
);

// Mint NFT
async function mintAchievementBadge(
  studentWalletAddress: string,
  metadata: {
    name: string;
    description: string;
    image: string; // IPFS URL
    attributes: Array<{ trait_type: string; value: string }>;
  }
) {
  const tx = await nftCollection.erc721.mintTo(
    studentWalletAddress,
    metadata
  );
  
  return {
    tokenId: tx.id.toString(),
    transactionHash: tx.receipt.transactionHash
  };
}
```

---

## Scalability & Performance

### Database Optimization

**1. Indexing Strategy:**
```sql
-- High-priority indexes for current schema
CREATE INDEX idx_users_supabase_id ON users(supabase_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_enrollments_child_id ON enrollments(child_id);
CREATE INDEX idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_school_id ON user_roles(school_id);

-- Planned indexes for new features
CREATE INDEX idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX idx_credit_ledger_status ON credit_ledger(status);
CREATE INDEX idx_credit_ledger_created_at ON credit_ledger(created_at);
CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
CREATE INDEX idx_student_achievements_student_id ON student_achievements(student_id);
CREATE INDEX idx_nft_badges_student_id ON nft_badges(student_id);
CREATE INDEX idx_nft_badges_token_id ON nft_badges(token_id);

-- Composite indexes for common queries
CREATE INDEX idx_enrollments_child_status 
  ON enrollments(child_id, status);
CREATE INDEX idx_classes_school_active 
  ON classes(school_id, status) WHERE status = 'active';
```

**2. Query Optimization:**
```typescript
// BAD: N+1 query problem
const classes = await db.select().from(classesTable);
for (const cls of classes) {
  cls.enrollments = await db.select()
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.classId, cls.id));
}

// GOOD: Single join query
const classesWithEnrollments = await db.select({
  class: classesTable,
  enrollment: enrollmentsTable
})
  .from(classesTable)
  .leftJoin(enrollmentsTable, eq(classesTable.id, enrollmentsTable.classId))
  .where(eq(classesTable.schoolId, schoolId));
```

**3. Caching Strategy:**
```typescript
// In-memory cache for frequently accessed data
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 }); // 10 minute TTL

async function getSchoolSettings(schoolId: number) {
  const cacheKey = `school_settings:${schoolId}`;
  
  // Check cache first
  let settings = cache.get(cacheKey);
  if (settings) {
    return settings;
  }
  
  // Query database
  settings = await db.select()
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);
  
  // Store in cache
  cache.set(cacheKey, settings);
  
  return settings;
}

// Invalidate cache on updates
async function updateSchoolSettings(schoolId: number, updates: any) {
  await db.update(schoolsTable)
    .set(updates)
    .where(eq(schoolsTable.id, schoolId));
  
  // Clear cache
  cache.del(`school_settings:${schoolId}`);
}
```

### API Performance

**1. Rate Limiting:**
```typescript
import rateLimit from 'express-rate-limit';

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later.'
});

app.use('/api/', apiLimiter);

// Stricter limits for AI endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
});

app.use('/api/ai-co-admin/', aiLimiter);

// Even stricter for NFT minting
const mintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 mints per minute per user
});

app.use('/api/nft/mint-badge', mintLimiter);
```

**2. Response Compression:**
```typescript
import compression from 'compression';

app.use(compression({
  level: 6, // Compression level (0-9)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

**3. Pagination:**
```typescript
// Standard pagination pattern
router.get('/api/credits/history', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;
  
  const [transactions, totalCount] = await Promise.all([
    db.select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, req.user.id))
      .orderBy(desc(creditLedger.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() })
      .from(creditLedger)
      .where(eq(creditLedger.userId, req.user.id))
  ]);
  
  res.json({
    data: transactions,
    pagination: {
      page,
      limit,
      total: totalCount[0].count,
      totalPages: Math.ceil(totalCount[0].count / limit)
    }
  });
});
```

### Frontend Performance

**1. Code Splitting:**
```typescript
// Lazy load routes
import { lazy, Suspense } from 'react';

const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const NFTGallery = lazy(() => import('./pages/student/NFTGallery'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/parent" component={ParentDashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/student/nfts" component={NFTGallery} />
      </Switch>
    </Suspense>
  );
}
```

**2. Query Optimization (TanStack Query):**
```typescript
// Prefetch data for better UX
function ClassCatalog() {
  const queryClient = useQueryClient();
  
  const { data: classes } = useQuery({
    queryKey: ['/api/classes'],
  });
  
  // Prefetch class details on hover
  const handleHover = (classId: number) => {
    queryClient.prefetchQuery({
      queryKey: ['/api/classes', classId],
      queryFn: () => fetch(`/api/classes/${classId}`).then(r => r.json()),
    });
  };
  
  return (
    <div>
      {classes?.map(cls => (
        <ClassCard 
          key={cls.id} 
          class={cls} 
          onMouseEnter={() => handleHover(cls.id)}
        />
      ))}
    </div>
  );
}
```

**3. Image Optimization:**
```typescript
// Use next-gen formats, lazy loading
<img 
  src={imageUrl} 
  alt={altText}
  loading="lazy"
  decoding="async"
  width={400}
  height={300}
/>

// For NFT images from IPFS, use CDN
function NFTImage({ ipfsUri }: { ipfsUri: string }) {
  const cdnUrl = ipfsUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  return <img src={cdnUrl} loading="lazy" alt="NFT Badge" />;
}
```

### Scalability Targets

**Current Capacity:**
- 1,000 concurrent users
- 10,000 students
- 100 schools
- 1,000 transactions/day

**Phase 1 Target:**
- 5,000 concurrent users
- 50,000 students
- 500 schools
- 10,000 transactions/day

**Phase 3 Target:**
- 50,000 concurrent users
- 500,000 students
- 5,000 schools
- 100,000 transactions/day
- 10,000 NFT mints/day

**Scaling Strategy:**
- Horizontal scaling of API servers
- Database read replicas
- CDN for static assets and NFT images
- Redis for session and cache management
- Queue system for blockchain operations (Bull/BullMQ)

---

## Error Handling & Resilience

### Error Handling Patterns

**1. API Error Responses:**
```typescript
// Standardized error response format
interface ApiError {
  error: string;           // Human-readable message
  code?: string;          // Error code for programmatic handling
  details?: any;          // Additional context
  timestamp: string;
}

// Example usage
try {
  const result = await someOperation();
  res.json({ success: true, data: result });
} catch (err) {
  console.error('Operation failed:', err);
  res.status(500).json({
    error: 'Operation failed',
    code: 'OPERATION_ERROR',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString()
  });
}
```

**2. Retry Logic:**
```typescript
// Retry failed blockchain transactions
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const nftMintResult = await retryOperation(
  () => nftCollection.erc721.mintTo(walletAddress, metadata),
  3
);
```

**3. Circuit Breaker Pattern:**
```typescript
// Prevent cascading failures for external services
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime! > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage for AI service
const aiCircuitBreaker = new CircuitBreaker(5, 60000);

async function callAI(prompt: string) {
  return aiCircuitBreaker.execute(() => anthropic.messages.create({ ... }));
}
```

### Graceful Degradation

**1. Fallback for AI Features:**
```typescript
async function generateLessonPlan(topic: string) {
  try {
    // Try AI generation
    return await aiService.generateLesson(topic);
  } catch (err) {
    console.error('AI service unavailable, using template fallback');
    // Fallback to template-based lesson
    return templateService.getLesson(topic);
  }
}
```

**2. Queue System for Blockchain Operations:**
```typescript
import Bull from 'bull';

const nftMintQueue = new Bull('nft-minting', {
  redis: process.env.REDIS_URL
});

// Add to queue instead of immediate execution
router.post('/api/students/:id/achievements/award', async (req, res) => {
  // ... validation ...
  
  // Create achievement record
  const achievement = await db.insert(studentAchievements).values({
    studentId: req.params.id,
    // ... other fields ...
  }).returning();
  
  // Queue NFT minting (non-blocking)
  await nftMintQueue.add({
    achievementId: achievement[0].id,
    studentId: req.params.id,
    metadata: { ... }
  });
  
  // Return immediately
  res.json({
    success: true,
    message: 'Achievement awarded. NFT minting in progress.',
    achievement: achievement[0]
  });
});

// Worker processes queue
nftMintQueue.process(async (job) => {
  const { achievementId, studentId, metadata } = job.data;
  
  try {
    const result = await mintNFT(studentId, metadata);
    await db.update(nftBadges)
      .set({ mintingStatus: 'minted', tokenId: result.tokenId })
      .where(eq(nftBadges.achievementId, achievementId));
  } catch (err) {
    // Retry handled by Bull automatically
    throw err;
  }
});
```

---

## Deployment Architecture

### Environment Setup

**Development:**
```
- Local development on Replit
- Neon PostgreSQL (development database)
- Supabase (test project)
- Stripe (test mode)
- All environment variables in Replit secrets
```

**Staging:**
```
- Deployed to Replit (separate deployment)
- Neon PostgreSQL (staging database)
- Supabase (staging project)
- Stripe (test mode)
- Full feature parity with production
```

**Production:**
```
- Deployed to Replit or dedicated hosting
- Neon PostgreSQL (production database with replicas)
- Supabase (production project)
- Stripe (live mode)
- CDN for static assets
- Load balancer for multiple API instances
```

### Deployment Pipeline

```
Code pushed to main branch
    ↓
Run tests (Jest, Playwright)
    ↓
TypeScript compilation
    ↓
Database migration check
    ↓
Build frontend (Vite)
    ↓
If all pass:
    ↓
    Deploy to staging
    ↓
    Run smoke tests
    ↓
    Manual approval for production
    ↓
    Deploy to production
    ↓
    Health check
    ↓
    Rollback if health check fails
```

### Monitoring & Logging

**Application Monitoring:**
- Error tracking (Sentry)
- Performance monitoring (response times)
- Database query performance
- API endpoint metrics

**Infrastructure Monitoring:**
- Server CPU/memory usage
- Database connections
- Disk usage
- Network traffic

**Business Metrics:**
- Daily/monthly active users
- Credit issuance rate
- NFT minting rate
- Revenue metrics

**Alerting:**
- Error rate exceeds threshold
- Response time degradation
- Database connection issues
- Blockchain transaction failures

---

**Document Control**
- Document Type: Software Design Document
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: Engineering Team
- Approvers: CTO, Lead Architect
