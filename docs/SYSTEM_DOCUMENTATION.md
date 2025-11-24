# ASA Learning Platform - System Documentation

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [Technology Stack](#technology-stack)
2. [Infrastructure Architecture](#infrastructure-architecture)
3. [Development Environment](#development-environment)
4. [Environment Configuration](#environment-configuration)
5. [Third-Party Integrations](#third-party-integrations)
6. [File Storage](#file-storage)
7. [Monitoring & Logging](#monitoring--logging)
8. [Performance Optimization](#performance-optimization)

---

## Technology Stack

### Frontend

#### Core Framework
**React 18** - Modern JavaScript library for building user interfaces
- **Version:** 18.3.1
- **Why:** Component-based architecture, virtual DOM, strong ecosystem
- **Key Features:** Hooks, Concurrent Mode, Server Components (future)

#### Build Tool
**Vite** - Next-generation frontend tooling
- **Version:** 5.4.11
- **Why:** Lightning-fast HMR, optimized builds, native ESM
- **Configuration:** `vite.config.ts`

#### Language
**TypeScript** - Typed superset of JavaScript
- **Version:** 5.6.2
- **Why:** Type safety, better IDE support, fewer runtime errors
- **Configuration:** `tsconfig.json`

#### State Management
**TanStack Query** - Powerful data fetching and caching
- **Version:** 5.62.3
- **Why:** Automatic caching, background refetching, optimistic updates
- **Usage:** All API calls, server state management

#### Routing
**Wouter** - Lightweight router for React
- **Version:** 3.3.5
- **Why:** Minimal bundle size (1.3KB), hooks-based API
- **Usage:** Client-side routing, protected routes

#### UI Components
**Shadcn/UI + Radix UI** - Accessible, customizable components
- **Radix UI:** Headless components (primitives)
- **Shadcn/UI:** Pre-styled components built on Radix
- **Why:** Accessibility built-in, full customization, no runtime JS overhead

#### Styling
**Tailwind CSS** - Utility-first CSS framework
- **Version:** 3.4.15
- **Why:** Rapid development, consistent design, small bundle size
- **Configuration:** `tailwind.config.ts`
- **Plugins:** 
  - `@tailwindcss/typography` - Beautiful typography
  - `tailwindcss-animate` - Animation utilities

#### Form Management
**React Hook Form** - Performant form validation
- **Version:** 7.54.2
- **Why:** Minimal re-renders, easy validation, small footprint
- **Integration:** Shadcn Form components

**Zod** - TypeScript-first schema validation
- **Version:** 3.23.8
- **Why:** Runtime validation, type inference, great DX
- **Integration:** `@hookform/resolvers/zod`

#### Icons
**Lucide React** - Beautiful & consistent icons
- **Version:** 0.462.0
- **Why:** Tree-shakable, modern design, frequent updates

**React Icons** - Icon library aggregator
- **Version:** 5.3.0
- **Why:** Access to many icon sets, including company logos

---

### Backend

#### Runtime
**Node.js** - JavaScript runtime
- **Version:** 20.x LTS
- **Why:** Performance, ecosystem, async I/O

#### Framework
**Express** - Web application framework
- **Version:** 4.21.1
- **Why:** Minimalist, flexible, large ecosystem
- **Middleware:** Body parser, CORS, compression

#### Language
**TypeScript** - Typed JavaScript
- **Version:** 5.6.2
- **Why:** Type safety, better tooling, shared types with frontend
- **Module System:** ESM (ES Modules)

#### Database ORM
**Drizzle ORM** - TypeScript ORM
- **Version:** 0.36.4
- **Why:** Type-safe, lightweight, migrations support
- **Driver:** `@neondatabase/serverless`

**Drizzle Kit** - Migration tool
- **Version:** 0.27.2
- **Why:** Auto-generate migrations, push schema changes

---

### Database

#### Primary Database
**PostgreSQL** - Relational database
- **Version:** 15+
- **Hosting:** Neon (serverless PostgreSQL)
- **Why:** ACID compliance, JSON support, mature ecosystem
- **Connection:** Pooled connections via `@neondatabase/serverless`

#### Connection Details
- **Host:** Neon serverless endpoint
- **SSL:** Required (TLS 1.3)
- **Pooling:** Automatic via Neon

---

### Authentication

#### Provider
**Supabase** - Backend-as-a-Service
- **Version:** @supabase/supabase-js 2.46.2
- **Usage:** 
  - Frontend: OAuth, session management
  - Backend: JWT validation, user admin
- **Why:** Secure auth out-of-the-box, OAuth integrations

#### OAuth Providers
- Google
- Facebook (planned)
- Email/Password
- Magic Link

---

### Payment Processing

#### Provider
**Stripe** - Payment infrastructure
- **Version:** stripe 17.4.0
- **Features:**
  - Stripe Checkout (hosted payment page)
  - Payment Intents
  - Webhooks
  - Subscriptions (planned)
  - Refunds
- **Why:** Industry standard, excellent documentation, robust webhooks

---

### AI Services

#### Primary AI: Anthropic Claude
- **Model:** claude-opus-4-20250514
- **SDK:** @anthropic-ai/sdk 0.34.1
- **Usage:**
  - Lesson plan generation
  - Content analysis
  - AI Co-Admin (planned)
  - Chatbot responses
- **Why:** Long context window, high quality, safety features

#### Image Generation: Stability AI
- **Usage:** Coloring page generation, NFT badge artwork (planned)
- **Why:** High-quality images, customizable

#### Text Processing: Hugging Face
- **Usage:** NLP tasks, text classification
- **Why:** Open-source models, cost-effective

---

### Communication Services

#### Email
**Brevo (formerly Sendinblue)**
- **Usage:** Transactional emails, welcome emails
- **Why:** Reliable delivery, good free tier

**SendGrid** (Backup)
- **Usage:** Fallback email provider
- **Why:** Industry standard, high deliverability

#### SMS
**Twilio**
- **Usage:** SMS notifications (planned)
- **Why:** Reliable, programmable, global reach

---

### Planned Technologies (Phases 2-3)

#### Blockchain Infrastructure
**Thirdweb** or **Alchemy** - Web3 development platform
- **Usage:** NFT minting, smart contract deployment
- **Why:** Abstracts blockchain complexity, gasless transactions

**Magic Link** - Wallet authentication
- **Usage:** Embedded wallets for students
- **Why:** Email-based, no seed phrases, COPPA compliant

**Polygon** - Layer 2 blockchain
- **Usage:** NFT deployment, token transactions
- **Why:** Low fees, Ethereum compatibility, fast finality

#### IPFS Storage
**Pinata** - IPFS pinning service
- **Usage:** NFT metadata and images
- **Why:** Permanent storage, reliable pinning

---

## Infrastructure Architecture

### Hosting

#### Current: Replit
- **Platform:** Replit Development Environment
- **Advantages:**
  - Integrated development environment
  - Easy collaboration
  - Zero setup
  - Automatic deployments
- **Limitations:**
  - Shared resources
  - Limited scaling options

#### Future: Production Hosting (Planned)
**Options being evaluated:**
- **Vercel/Netlify:** Frontend (Vite app)
- **Railway/Render:** Backend (Express API)
- **Neon:** Database (already using)

**Requirements:**
- Automatic HTTPS
- Environment variables
- Continuous deployment from Git
- Monitoring and logging
- Load balancing (for scaling)

---

### Database Hosting

#### Neon PostgreSQL
- **Type:** Serverless PostgreSQL
- **Region:** US East (configurable)
- **Features:**
  - Auto-scaling
  - Automatic backups
  - Point-in-time recovery
  - Branch databases (like Git branches)
  - Connection pooling

**Connection String Format:**
```
postgresql://username:password@host/database?sslmode=require
```

**Connection Pooling:**
- Neon handles pooling automatically
- Max connections: Scales with plan
- Idle timeout: 60 seconds

---

### CDN & Static Assets

#### Current: Local Storage
- **Location:** `attached_assets/` directory
- **Types:** Images, PDFs, uploaded files
- **Served by:** Express static middleware

#### Future: CDN (Planned)
**Cloudflare or AWS CloudFront**
- **Usage:** Static assets, NFT images
- **Benefits:** 
  - Global edge caching
  - Faster load times
  - Reduced server load

---

## Development Environment

### Local Setup

#### Prerequisites
- Node.js 20.x
- npm or yarn
- Git
- PostgreSQL client (optional, for direct DB access)

#### Installation Steps

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd asa-learning-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access application**
   - Frontend: http://localhost:5000
   - API: http://localhost:5000/api

#### Development Scripts

```json
{
  "dev": "concurrently \"npm run server\" \"npm run client\"",
  "server": "tsx watch server/index.ts",
  "client": "vite",
  "build": "vite build",
  "db:push": "drizzle-kit push",
  "db:push --force": "drizzle-kit push --force",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

#### Development Workflow

1. Create feature branch
2. Make code changes
3. Test locally
4. Run type checking: `npm run typecheck`
5. Commit and push
6. Deploy to staging (automatic)
7. Test in staging
8. Deploy to production (manual approval)

---

### Code Quality Tools

#### TypeScript
- **Config:** `tsconfig.json`
- **Strict mode:** Enabled
- **Check:** `tsc --noEmit`

#### ESLint
- **Config:** `.eslintrc.js`
- **Rules:** React, TypeScript, Accessibility
- **Check:** `npm run lint`

#### Prettier (optional)
- **Config:** `.prettierrc`
- **Format:** `npm run format`

---

## Environment Configuration

### Environment Variables

#### Development (.env)
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/asa_dev

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
STABILITY_API_KEY=sk-...
HUGGINGFACE_API_KEY=hf_...

# Email
BREVO_API_KEY=xkeysib-...
SENDGRID_API_KEY=SG....

# SMS
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# Application
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5000
```

#### Production (.env.production)
```bash
# Database
DATABASE_URL=postgresql://user:pass@neon-host/asa_prod?sslmode=require

# Supabase
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_SERVICE_KEY=<production-key>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...

# AI Services (same as dev, monitor usage)
ANTHROPIC_API_KEY=sk-ant-...

# Application
NODE_ENV=production
PORT=443
FRONTEND_URL=https://asa-platform.com
```

#### Planned Environment Variables (Phases 2-3)
```bash
# Blockchain (Phase 3)
THIRDWEB_SECRET_KEY=...
THIRDWEB_CLIENT_ID=...
MAGIC_LINK_SECRET_KEY=...
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_CHAIN_ID=137
NFT_CONTRACT_ADDRESS=0x...
ASA_TOKEN_CONTRACT_ADDRESS=0x...

# IPFS
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
```

---

### Secrets Management

#### Replit Secrets
All sensitive values stored in Replit Secrets:
- Never committed to Git
- Encrypted at rest
- Accessible via `process.env`
- Team members can access if needed

#### Access Pattern
```typescript
// Backend
const stripeKey = process.env.STRIPE_SECRET_KEY;

// Frontend (only VITE_ prefixed variables)
const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
```

---

## Third-Party Integrations

### Supabase Integration

#### Setup Steps
1. Create Supabase project at https://supabase.com
2. Enable Email/Password authentication
3. Configure OAuth providers (Google, etc.)
4. Copy project URL and keys
5. Add to environment variables

#### Configuration
```typescript
// Backend: Admin client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // Full access
  { auth: { persistSession: false } }
);

// Frontend: Anonymous client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);
```

#### Usage
- **Frontend:** User authentication, session management
- **Backend:** JWT validation, user admin operations
- **NOT for:** General data queries (use PostgreSQL directly)

---

### Stripe Integration

#### Setup Steps
1. Create Stripe account at https://stripe.com
2. Enable test mode
3. Copy API keys (publishable and secret)
4. Set up webhook endpoint
5. Configure products and prices

#### Webhook Setup
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy webhook signing secret

#### Configuration
```typescript
// Backend
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

// Webhook handler
app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature']!;
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
  // Handle event...
});
```

---

### Anthropic AI Integration

#### Setup Steps
1. Sign up at https://anthropic.com
2. Generate API key
3. Add to environment variables
4. Monitor usage in dashboard

#### Configuration
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

// Usage
const message = await anthropic.messages.create({
  model: 'claude-opus-4-20250514',
  max_tokens: 2048,
  messages: [
    { role: 'user', content: 'Generate a lesson plan about fractions' }
  ]
});
```

#### Cost Management
- **Model:** Claude Opus (~$15 per 1M input tokens)
- **Optimization:** Cache common prompts, use smaller models for simple tasks
- **Monitoring:** Track token usage per request

---

### Brevo Email Integration

#### Setup Steps
1. Create account at https://brevo.com
2. Verify domain (for custom sender)
3. Generate API key
4. Create email templates

#### Configuration
```typescript
import { TransactionalEmailsApi } from '@getbrevo/brevo';

const brevo = new TransactionalEmailsApi();
brevo.setApiKey('BREVO_API_KEY', process.env.BREVO_API_KEY!);

// Send email
await brevo.sendTransacEmail({
  sender: { email: 'noreply@asa.com', name: 'ASA Platform' },
  to: [{ email: 'user@example.com' }],
  subject: 'Welcome to ASA!',
  htmlContent: '<h1>Welcome!</h1>...'
});
```

---

## File Storage

### Current: Local File System

#### Structure
```
attached_assets/
├── uploads/
│   ├── profiles/           # User profile images
│   ├── children/           # Student photos
│   ├── schools/            # School logos
│   └── classes/            # Class images
├── knowledge_bases/        # Uploaded documents
│   ├── school-1/
│   │   ├── kb-1/
│   │   │   ├── document1.pdf
│   │   │   └── document2.docx
│   └── school-2/
└── generated/              # AI-generated content
    ├── lessons/
    └── images/
```

#### Upload Handling
```typescript
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'attached_assets/uploads/profiles/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Usage
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ url: `/uploads/profiles/${req.file.filename}` });
});
```

---

### Future: Cloud Storage (Planned)

#### AWS S3 or Cloudflare R2
**Benefits:**
- Unlimited storage
- Global CDN
- Automatic backups
- Better security

**Migration Plan:**
1. Set up S3 bucket or R2
2. Configure bucket policies
3. Update upload handlers
4. Migrate existing files
5. Update file URLs

---

## Monitoring & Logging

### Application Logging

#### Winston Logger (Planned)
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Usage
logger.info('User registered', { userId: 123, email: 'user@example.com' });
logger.error('Payment failed', { error: err.message, paymentId: 'pi_123' });
```

---

### Error Tracking

#### Sentry (Planned)
- Real-time error tracking
- Performance monitoring
- Release tracking
- User feedback

**Setup:**
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

---

### Performance Monitoring

#### Metrics to Track
- API response times
- Database query duration
- Page load times
- Error rates
- User session duration

#### Tools
- **Backend:** New Relic or DataDog (planned)
- **Frontend:** Vercel Analytics or Google Analytics
- **Database:** Neon built-in monitoring

---

## Performance Optimization

### Frontend Optimization

#### Code Splitting
```typescript
// Lazy load routes
const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
```

#### Bundle Size Optimization
- Tree shaking (automatic with Vite)
- Dynamic imports for large libraries
- Image optimization (lazy loading, WebP format)

#### Caching Strategy
```typescript
// TanStack Query cache configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
  },
});
```

---

### Backend Optimization

#### Database Query Optimization
- Use indexes on frequently queried columns
- Limit SELECT fields (avoid SELECT *)
- Use JOIN instead of multiple queries
- Implement pagination

#### API Response Compression
```typescript
import compression from 'compression';

app.use(compression({
  level: 6,
  threshold: 1024,
}));
```

#### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
});

app.use('/api/', limiter);
```

---

### Database Optimization

#### Connection Pooling
- Neon handles pooling automatically
- Max connections scale with plan

#### Query Optimization
- Add indexes on foreign keys
- Use composite indexes for multi-column queries
- Analyze slow queries with EXPLAIN

#### Caching
- In-memory cache for frequently accessed data (e.g., school settings)
- Redis for session storage (planned)

---

**Document Control**
- Document Type: System Documentation
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: DevOps Team
- Approvers: CTO, Infrastructure Lead
