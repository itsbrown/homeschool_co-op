# Deployment Configuration for Replit Autoscale

This document outlines the deployment configuration required for the ASA Learning Platform to work correctly with Replit's Autoscale deployments.

## Key Changes for Autoscale Compatibility

The application has been configured to work with Autoscale deployments by:
1. **Idempotent migrations:** All database migrations use `IF NOT EXISTS` and are safe to run multiple times
2. **Conditional background jobs:** Background services only run in development, not in production Autoscale
3. **No filesystem dependencies:** Removed assumptions about persistent filesystem storage in production

## Build and Run Commands

Use the standard build and run commands in your deployment settings:

**Build Command:**
```bash
vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

**Run Command:**
```bash
NODE_ENV=production node dist/index.js
```

## What This Fixes

### Database Migrations
- **Before:** Migration errors on cold starts due to repeated execution
- **After:** Idempotent migrations (using `IF NOT EXISTS`) run safely on each startup
- **Result:** No errors, migrations auto-sync across all instances

### Background Jobs
- **Before:** Backup service and membership status jobs started on every instance
- **After:** Background jobs disabled in production (Autoscale doesn't support persistent tasks)
- **Result:** Clean startup, no wasted resources

### Data Loading
- **Before:** Notification seeding ran on every startup
- **After:** Data loading only happens in development
- **Result:** Predictable production behavior

## Architecture Changes

### Runtime Operations (All Environments)
Every instance startup includes:
- Database initialization with idempotent migrations
- Express server setup
- Route registration  
- API endpoint configuration
- WebSocket server initialization

### Development-Only Operations
Only in `NODE_ENV=development` or `test`:
- Backup service initialization
- Membership status tracking jobs
- Notification data seeding

### Environment-Based Behavior

| Feature | Development | Production (Autoscale) |
|---------|-------------|------------------------|
| Database migrations | ✅ Idempotent migrations on startup | ✅ Idempotent migrations on startup |
| Background jobs | ✅ Enabled | ❌ Disabled |
| Data seeding | ✅ Enabled | ❌ Disabled |
| Backup service | ✅ Enabled | ❌ Disabled |

## Production Requirements

For production deployments with Autoscale, ensure:

1. ✅ Build and run commands configured as shown above
2. ✅ `NODE_ENV=production` set in deployment environment
3. ✅ All required environment variables set (SUPABASE_URL, STRIPE keys, etc.)
4. ✅ Database connection available during server startup (migrations run on startup)

## Background Tasks in Production

Autoscale deployments **cannot** run background tasks like:
- Scheduled backups
- Membership status updates
- Periodic data cleanup

### Solutions for Background Tasks

If you need background tasks in production:

1. **Scheduled Deployments:** Use Replit's Scheduled Deployments for periodic tasks
2. **Reserved VM:** Use Reserved VM deployment for continuous background processes
3. **External Cron:** Use an external service (GitHub Actions, cron-job.org) to trigger API endpoints

## Monitoring

After deployment, check logs for these success indicators:

```
Initializing database...
✅ Migration completed: [migration name]
Database/storage initialization complete.
☁️ Production mode: Background jobs disabled (not compatible with Autoscale deployments)
```

If you see migration errors in production logs, verify:
- Database connection is available during startup
- Environment variables are set correctly
- Migrations are truly idempotent

## Troubleshooting

### Issue: Migration notices in logs (NOTICE: column already exists)
**Solution:** This is normal - PostgreSQL notices are not errors. Migrations are idempotent.

### Issue: App won't start in production
**Solution:** Check that database connection is available and environment variables are set

### Issue: Background tasks not running
**Solution:** This is expected - use Scheduled Deployments or Reserved VM for background tasks

### Issue: "Migration note: relation already exists"
**Solution:** This is normal - migrations skip existing tables/columns safely

## Development Workflow

Development mode remains unchanged:
```bash
npm run dev
```

This starts the server with:
- Idempotent migrations on startup
- Background jobs enabled
- Data seeding enabled
- Hot reload with Vite

## Related Files

- `server/init-db.ts` - Idempotent migration logic
- `server/routes.ts` - Calls database initialization on startup
- `server/index.ts` - Conditionally runs background jobs (dev only)
