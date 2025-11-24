# ASA Learning Platform - Deployment and Maintenance Guide

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [Installation & Setup](#installation--setup)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup & Migrations](#database-setup--migrations)
4. [Deployment Procedures](#deployment-procedures)
5. [Blockchain Deployment (Planned)](#blockchain-deployment-planned)
6. [Monitoring & Logging](#monitoring--logging)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)
9. [Update Procedures](#update-procedures)

---

## Installation & Setup

### Prerequisites

Before installation, ensure you have:

- **Node.js:** v20.x LTS or higher
- **npm:** v10.x or higher (comes with Node.js)
- **Git:** Latest version
- **PostgreSQL Client:** Optional, for direct database access
- **Replit Account:** For deployment (current setup)

### Local Development Setup

#### Step 1: Clone Repository

```bash
git clone <repository-url>
cd asa-learning-platform
```

#### Step 2: Install Dependencies

```bash
npm install
```

This installs all required packages listed in `package.json`.

#### Step 3: Configure Environment Variables

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Environment Configuration](#environment-configuration) section).

#### Step 4: Database Setup

**Option A: Use existing Neon database**
```bash
# Set DATABASE_URL in .env
DATABASE_URL=postgresql://user:pass@host/database?sslmode=require
```

**Option B: Create new Neon database**
1. Visit https://neon.tech
2. Create new project
3. Copy connection string
4. Add to .env

**Sync schema to database:**
```bash
npm run db:push
```

Or force push if needed:
```bash
npm run db:push --force
```

#### Step 5: Verify Installation

Start development server:
```bash
npm run dev
```

Visit http://localhost:5000

You should see the application landing page.

---

### Replit Setup

#### Step 1: Import Project

1. Log in to Replit
2. Click "Create Repl"
3. Select "Import from GitHub"
4. Paste repository URL
5. Replit auto-detects language and configuration

#### Step 2: Configure Secrets

1. Open "Secrets" tab (lock icon)
2. Add all environment variables (see list below)
3. Never expose secrets in code

#### Step 3: Install Dependencies

Replit automatically runs `npm install` on first load.

If needed, manually run:
```bash
npm install
```

#### Step 4: Configure Database

Use Replit's integration or external Neon database:

**Option A: Replit PostgreSQL (Development)**
1. Add PostgreSQL from integrations
2. Connection string auto-populated

**Option B: Neon (Recommended for Production)**
1. Create Neon database
2. Add `DATABASE_URL` to secrets

#### Step 5: Run Migrations

In Replit Shell:
```bash
npm run db:push
```

#### Step 6: Start Application

Click "Run" button or:
```bash
npm run dev
```

---

## Environment Configuration

### Required Environment Variables

#### Application

```bash
# Environment (development, staging, production)
NODE_ENV=production

# Server Port (Replit uses 5000)
PORT=5000

# Frontend URL (for redirects, emails)
FRONTEND_URL=https://your-app.replit.app
```

---

#### Database

```bash
# Neon PostgreSQL Connection String
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

**Format:**
```
postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

**Example:**
```
postgresql://asa_user:SecurePass123@ep-cool-cloud-123456.us-east-2.aws.neon.tech/asa_prod?sslmode=require
```

---

#### Supabase (Authentication)

```bash
# Supabase Project URL
SUPABASE_URL=https://abcdefghijklmnop.supabase.co

# Service Role Key (Backend - full access)
SUPABASE_SERVICE_KEY=eyJhbGci...

# Anonymous Key (Frontend - limited access)
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

**How to get:**
1. Log in to Supabase
2. Go to Project Settings → API
3. Copy URL, service_role key, anon key

---

#### Stripe (Payments)

```bash
# Secret Key (Backend)
STRIPE_SECRET_KEY=sk_live_...  # Production
# OR
STRIPE_SECRET_KEY=sk_test_...  # Testing

# Publishable Key (Frontend)
VITE_STRIPE_PUBLIC_KEY=pk_live_...  # Production
# OR
VITE_STRIPE_PUBLIC_KEY=pk_test_...  # Testing

# Webhook Signing Secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

**How to get:**
1. Log in to Stripe Dashboard
2. Go to Developers → API Keys
3. Copy secret and publishable keys
4. For webhook secret:
   - Go to Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/stripe/webhook`
   - Copy signing secret

---

#### AI Services

```bash
# Anthropic (Claude AI)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Stability AI (Image Generation)
STABILITY_API_KEY=sk-...

# Hugging Face (NLP)
HUGGINGFACE_API_KEY=hf_...
```

**How to get:**
- **Anthropic:** https://console.anthropic.com → Settings → API Keys
- **Stability AI:** https://platform.stability.ai → Account → API Keys
- **Hugging Face:** https://huggingface.co → Settings → Access Tokens

---

#### Email Services

```bash
# Brevo (Primary)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@yourschool.com
BREVO_SENDER_NAME=ASA Platform

# SendGrid (Backup)
SENDGRID_API_KEY=SG....
```

**How to get:**
- **Brevo:** https://app.brevo.com → Settings → API Keys
- **SendGrid:** https://app.sendgrid.com → Settings → API Keys

---

#### SMS (Optional)

```bash
# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
```

**How to get:**
1. Log in to Twilio Console
2. Copy Account SID and Auth Token
3. Buy/configure phone number

---

#### Planned (Blockchain - Phase 3)

```bash
# Thirdweb
THIRDWEB_SECRET_KEY=...
THIRDWEB_CLIENT_ID=...

# Magic Link (Wallets)
MAGIC_LINK_SECRET_KEY=...
MAGIC_LINK_PUBLISHABLE_KEY=...

# Polygon RPC
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_CHAIN_ID=137

# Smart Contracts
NFT_CONTRACT_ADDRESS=0x...
ASA_TOKEN_CONTRACT_ADDRESS=0x...

# IPFS (Pinata)
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
```

---

### Environment Variable Security

**Best Practices:**
1. **Never commit secrets to Git**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for reference only

2. **Use different keys per environment**
   - Development: Test keys
   - Production: Live keys

3. **Rotate keys regularly**
   - Change keys every 90 days
   - Immediately if compromised

4. **Limit access**
   - Only authorized team members
   - Use Replit Teams for access control

5. **Monitor usage**
   - Track API key usage
   - Alert on unusual activity

---

## Database Setup & Migrations

### Initial Database Setup

#### Step 1: Create Database

**Using Neon (Recommended):**
1. Visit https://neon.tech
2. Sign up or log in
3. Click "New Project"
4. Select region (US East for lowest latency)
5. Copy connection string
6. Add to environment variables

**Database Configuration:**
- **Name:** asa-learning-platform
- **Region:** US East (or closest to users)
- **Postgres Version:** 15+
- **Compute Size:** Start with smallest, scale up

#### Step 2: Configure Connection

Add to `.env`:
```bash
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

**Connection Pooling:**
Neon handles pooling automatically. No additional configuration needed.

#### Step 3: Initialize Schema

```bash
npm run db:push
```

This creates all tables based on `shared/schema.ts`.

**If you encounter errors:**
```bash
npm run db:push --force
```

#### Step 4: Verify Setup

**Check tables created:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

You should see:
- users
- schools
- classes
- enrollments
- children
- user_roles
- locations
- categories
- notifications
- etc.

---

### Database Migrations

#### Migration Philosophy

**Drizzle Kit** manages schema changes. We use two approaches:

**1. Schema Push (Development & Simple Changes)**
```bash
npm run db:push
```
- Compares schema to database
- Generates and executes SQL
- Fast and simple
- No migration files

**2. Migration Files (Complex Changes & Production)**
```bash
npm run db:generate    # Generate migration
npm run db:migrate      # Apply migration
```
- Creates versioned migration files
- Allows review before applying
- Safer for production

---

#### Common Migration Scenarios

**Scenario 1: Add New Column**

1. Edit `shared/schema.ts`:
```typescript
export const users = pgTable('users', {
  // ... existing columns
  phoneVerified: boolean('phone_verified').default(false),  // NEW
});
```

2. Push to database:
```bash
npm run db:push
```

**Scenario 2: Add New Table**

1. Define table in `shared/schema.ts`:
```typescript
export const creditLedger = pgTable('credit_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 10, scale: 2 }),
  // ... more columns
});
```

2. Push to database:
```bash
npm run db:push
```

**Scenario 3: Add Index**

1. Update schema:
```typescript
export const enrollments = pgTable('enrollments', {
  // ... columns
}, (table) => ({
  childStatusIdx: index('idx_enrollments_child_status').on(table.childId, table.status),
}));
```

2. Push:
```bash
npm run db:push
```

---

#### Production Migration Process

**Preparation:**
1. **Test in development**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

2. **Review migration file**
   - Check SQL in `db/migrations/`
   - Verify no destructive operations
   - Ensure backwards compatibility

3. **Backup production database**
   ```bash
   # Neon automatic backups are available
   # Or manual backup:
   pg_dump $DATABASE_URL > backup.sql
   ```

**Deployment:**
1. **Schedule maintenance window**
   - Low-traffic time
   - Notify users

2. **Run migration**
   ```bash
   npm run db:migrate
   ```

3. **Verify migration**
   - Check tables exist
   - Query sample data
   - Run smoke tests

4. **Monitor for errors**
   - Watch logs
   - Check error tracking

5. **Rollback if needed**
   - Restore from backup
   - Fix issues
   - Retry

---

#### Migration Best Practices

**DO:**
- ✅ Add new columns with DEFAULT values
- ✅ Create indexes during low-traffic periods
- ✅ Test migrations in development first
- ✅ Backup before production migrations
- ✅ Keep migrations small and focused

**DON'T:**
- ❌ Change primary key types (serial ↔ varchar)
- ❌ Drop columns without confirmation
- ❌ Rename tables in production (high risk)
- ❌ Run migrations during peak traffic
- ❌ Skip testing

---

### Data Seeding

#### Development Data

Create seed script `db/seed.ts`:

```typescript
import { db } from '../server/config/database';
import { schools, users, categories } from '../shared/schema';

async function seed() {
  // Seed schools
  const [school] = await db.insert(schools).values({
    name: 'Test School',
    domain: 'test-school',
  }).returning();

  // Seed categories
  await db.insert(categories).values([
    { schoolId: school.id, name: 'STEM', color: '#3B82F6' },
    { schoolId: school.id, name: 'Arts', color: '#EC4899' },
  ]);

  // Seed admin user
  await db.insert(users).values({
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'schoolAdmin',
  });

  console.log('Seed completed!');
}

seed();
```

Run:
```bash
tsx db/seed.ts
```

---

## Deployment Procedures

### Current: Replit Deployment

#### Automatic Deployment

1. **Push to Git**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

2. **Replit auto-deploys**
   - Detects changes
   - Runs `npm install`
   - Restarts application

3. **Verify deployment**
   - Check application loads
   - Test critical features
   - Monitor logs

---

#### Manual Deployment

1. **Open Replit project**
2. **Pull latest code** (if using Git)
3. **Install dependencies** (if needed)
   ```bash
   npm install
   ```
4. **Run migrations**
   ```bash
   npm run db:push
   ```
5. **Restart application**
   - Click "Stop" then "Run"

---

### Future: Production Deployment

#### Vercel (Frontend) + Railway (Backend)

**Architecture:**
```
Frontend (Vite app) → Vercel
Backend (Express API) → Railway
Database → Neon
CDN → Cloudflare
```

**Deployment Steps:**

**1. Prepare Repository**
```bash
git checkout -b production
git push origin production
```

**2. Deploy Frontend to Vercel**
1. Log in to Vercel
2. Import Git repository
3. Configure:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables (VITE_* only)
5. Deploy

**3. Deploy Backend to Railway**
1. Log in to Railway
2. New Project → Deploy from GitHub
3. Select repository
4. Configure:
   - Start Command: `node server/index.js`
   - Add environment variables (all backend secrets)
5. Deploy

**4. Update DNS**
- Point domain to Vercel (frontend)
- Point API subdomain to Railway (backend)

**5. Test Production**
- Visit production URL
- Test critical flows
- Monitor logs

---

## Blockchain Deployment (Planned)

### Phase 3: Smart Contract Deployment

#### Prerequisites

- **Wallet:** MetaMask with MATIC for gas
- **RPC Access:** Alchemy or Infura account
- **Deployment Tool:** Hardhat or Thirdweb

---

#### Smart Contract Deployment Steps

**1. Prepare Contracts**

Solidity contracts:
- `ASABadgeNFT.sol` (ERC-721)
- `ASAToken.sol` (ERC-20)
- `ASAStaking.sol`
- `ASAGovernance.sol`

**2. Compile Contracts**
```bash
npx hardhat compile
```

**3. Test Contracts**
```bash
npx hardhat test
```

**4. Deploy to Polygon Testnet (Mumbai)**
```bash
npx hardhat run scripts/deploy.js --network mumbai
```

**5. Verify on PolygonScan**
```bash
npx hardhat verify --network mumbai <contract-address>
```

**6. Test Deployment**
- Mint test NFT
- Transfer tokens
- Verify on explorer

**7. Deploy to Polygon Mainnet**
```bash
npx hardhat run scripts/deploy.js --network polygon
```

**8. Update Environment Variables**
```bash
NFT_CONTRACT_ADDRESS=0x...
ASA_TOKEN_CONTRACT_ADDRESS=0x...
```

**9. Initialize Contracts**
- Set minter role
- Configure parameters
- Transfer ownership to multisig

---

## Monitoring & Logging

### Application Logging

#### Winston Logger Setup

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

**Usage:**
```typescript
logger.info('User registered', { userId: 123 });
logger.error('Payment failed', { error: err.message });
```

---

### Metrics to Monitor

**Application Metrics:**
- API response times
- Error rates
- Active users
- Database query performance

**Business Metrics:**
- Daily signups
- Enrollments per day
- Revenue
- Credit issuance

**Infrastructure Metrics:**
- CPU usage
- Memory usage
- Database connections
- Network traffic

---

### Monitoring Tools (Planned)

**1. Sentry (Error Tracking)**
- Real-time error notifications
- Stack traces
- User context
- Release tracking

**2. DataDog or New Relic (APM)**
- Performance monitoring
- Database query analysis
- Distributed tracing

**3. Vercel Analytics**
- Page views
- Performance scores
- User geography

---

## Backup & Recovery

### Database Backups

#### Automatic Backups (Neon)

Neon provides automatic backups:
- **Frequency:** Every 24 hours
- **Retention:** 7 days (paid plans: 30 days)
- **Point-in-time recovery:** Available

**Access backups:**
1. Log in to Neon console
2. Select project
3. Go to "Backups" tab
4. Restore to specific point in time

---

#### Manual Backups

**Create backup:**
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Restore backup:**
```bash
psql $DATABASE_URL < backup-20251124.sql
```

**Automated Backup Script:**
```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
FILENAME="$BACKUP_DIR/asa-backup-$DATE.sql"

mkdir -p $BACKUP_DIR
pg_dump $DATABASE_URL > $FILENAME
gzip $FILENAME

# Upload to S3 (optional)
aws s3 cp $FILENAME.gz s3://asa-backups/

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $FILENAME.gz"
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup.sh
```

---

### Disaster Recovery Plan

**Scenario 1: Database Corruption**

1. **Stop application immediately**
2. **Assess damage**
   - Query database for consistency
   - Check recent changes
3. **Restore from backup**
   ```bash
   psql $DATABASE_URL < latest-backup.sql
   ```
4. **Verify restoration**
   - Check data integrity
   - Test critical queries
5. **Restart application**
6. **Monitor for issues**

**Scenario 2: Complete Data Loss**

1. **Provision new database**
2. **Restore from latest backup**
3. **Update connection string**
4. **Run migrations (if needed)**
5. **Verify all data present**
6. **Resume operations**

---

## Troubleshooting

### Common Issues

#### Issue: Application won't start

**Symptoms:**
- Error on `npm run dev`
- Port already in use
- Module not found

**Solutions:**

1. **Check port availability**
   ```bash
   lsof -i :5000
   kill -9 <PID>
   ```

2. **Reinstall dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check environment variables**
   - Verify all required variables set
   - Check for typos

4. **Check Node version**
   ```bash
   node --version  # Should be 20.x
   ```

---

#### Issue: Database connection fails

**Symptoms:**
- "Connection refused"
- "SSL required"
- Timeout errors

**Solutions:**

1. **Verify connection string**
   - Check `DATABASE_URL` format
   - Ensure `?sslmode=require` appended

2. **Test connection**
   ```bash
   psql $DATABASE_URL
   ```

3. **Check database status**
   - Log in to Neon console
   - Verify database running

4. **Check IP whitelist**
   - Neon allows all IPs by default
   - Verify no firewall blocking

---

#### Issue: Stripe webhooks not received

**Symptoms:**
- Payments succeed but enrollments not confirmed
- Webhook endpoint returns 404

**Solutions:**

1. **Verify webhook endpoint**
   - Should be: `https://your-domain.com/api/stripe/webhook`
   - Must be HTTPS in production

2. **Check webhook signature**
   - Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard

3. **Test webhook locally**
   ```bash
   stripe listen --forward-to localhost:5000/api/stripe/webhook
   ```

4. **Check logs**
   - Look for webhook errors in application logs

---

#### Issue: AI requests fail

**Symptoms:**
- "API key invalid"
- Timeout errors
- Rate limit exceeded

**Solutions:**

1. **Verify API key**
   - Check `ANTHROPIC_API_KEY` is correct
   - Ensure no extra spaces

2. **Check billing**
   - Log in to Anthropic console
   - Verify account has credits

3. **Reduce request size**
   - Limit max_tokens
   - Simplify prompts

4. **Implement retry logic**
   ```typescript
   async function callWithRetry(fn, retries = 3) {
     for (let i = 0; i < retries; i++) {
       try {
         return await fn();
       } catch (err) {
         if (i === retries - 1) throw err;
         await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
       }
     }
   }
   ```

---

## Update Procedures

### Application Updates

#### Minor Updates (Patches, Bug Fixes)

1. **Pull latest code**
   ```bash
   git pull origin main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run database migrations**
   ```bash
   npm run db:push
   ```

4. **Restart application**

5. **Verify changes**
   - Test affected features
   - Check logs

---

#### Major Updates (Features, Breaking Changes)

1. **Review changelog**
   - Understand changes
   - Note breaking changes

2. **Backup database**
   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```

3. **Create staging environment**
   - Clone production database
   - Deploy to staging

4. **Test in staging**
   - Run full test suite
   - Manual testing of critical paths

5. **Schedule maintenance**
   - Notify users
   - Plan rollback procedure

6. **Deploy to production**
   ```bash
   git checkout main
   git pull
   npm install
   npm run db:migrate
   ```

7. **Monitor closely**
   - Watch error rates
   - Check performance
   - User feedback

8. **Rollback if needed**
   - Revert to previous version
   - Restore database backup
   - Investigate issues

---

### Rollback Procedure

**Quick Rollback (Code Only):**

1. **Revert to previous commit**
   ```bash
   git revert HEAD
   git push
   ```

2. **Restart application**

**Full Rollback (Code + Database):**

1. **Stop application**

2. **Restore database**
   ```bash
   psql $DATABASE_URL < backup-before-update.sql
   ```

3. **Revert code**
   ```bash
   git reset --hard <previous-commit-hash>
   git push --force
   ```

4. **Restart application**

5. **Verify restoration**

6. **Communicate to users**

---

**Document Control**
- Document Type: Deployment and Maintenance Guide
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: DevOps Team
- Approvers: CTO, Infrastructure Lead
