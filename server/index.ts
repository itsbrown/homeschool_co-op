// Load test environment configuration (conditionally based on NODE_ENV)
// MUST be the first import so Stripe keys are set before any service initialises.
import "./test-env-loader";

import express from "express";
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

// Stripe webhook router is intentionally mounted from the lightweight entry
// point (rather than only inside server/app-init.ts) so that webhook delivery
// is reachable as soon as the HTTP server binds, even if the heavy app-init
// bundle is still loading. The router itself is small and has no heavy
// transitive imports.
import stripeWebhookRouter from "./api/stripe-webhook";

// Inline log to avoid pulling server/vite.ts (and its Vite dependency) into
// the entry-point bundle, which would add significant parse-time weight.
function log(message: string): void {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [express] ${message}`);
}

// 🔒 PRODUCTION SAFETY: Verify NODE_ENV is set and log startup environment
const currentEnv = process.env.NODE_ENV || 'development';
console.log('🚀 Server starting in environment:', currentEnv);

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function shouldRunBackgroundJobs(env: string): boolean {
  if (env === 'test') return false;
  if (env === 'development') return true;

  // Production/staging safety: background jobs run only with explicit singleton opt-in.
  // This avoids accidental multi-replica schedulers in autoscaled web fleets.
  return parseBooleanEnv(process.env.ENABLE_BACKGROUND_JOBS, false);
}

if (currentEnv === 'production') {
  console.log('✅ Production mode: Database fallbacks disabled, test authentication blocked');
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables in production:', missingVars.join(', '));
    process.exit(1);
  }
} else {
  console.log('⚙️ Development/Test mode: Database fallbacks enabled for testing');
}

const app = express();
export { app };
export default app;

// Lightweight health check — must respond instantly for deployment health probes.
// This is intentionally registered before initializeApp() runs so it is always
// reachable, even during the few seconds the heavy bundle is loading.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Mount the Stripe webhook router immediately so payment event delivery does
// not race the heavy app-init bundle. The router uses raw-body middleware
// internally for signature verification.
app.use("/api/stripe-webhooks", stripeWebhookRouter);

// In production: serve the Vite-compiled frontend immediately so that GET /
// responds before initializeApp() finishes loading all API routes (~7s).
// In development, setupVite() (called inside initializeApp) handles this.
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(import.meta.dirname, 'public');
  if (fs.existsSync(publicDir)) {
    // Prevent stale index.html from caching across deployments.
    // Fingerprinted asset chunks are safe to cache forever.
    app.use((req, _res, next) => {
      if (req.path === '/' || (!req.path.startsWith('/api') && !req.path.match(/\.\w+$/))) {
        _res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        _res.setHeader('Pragma', 'no-cache');
        _res.setHeader('Expires', '0');
      }
      next();
    });
    // Serve fingerprinted static assets (JS, CSS, images from dist/public/assets)
    app.use(express.static(publicDir));
    // SPA catch-all: serve index.html for all non-API, non-asset routes.
    // API routes registered later by initializeApp() take precedence because
    // Express matches in registration order — /api/* routes are added to the
    // router by registerRoutes(), but this catch-all only fires for paths that
    // have NOT already been handled. However, since this is a catch-all *use*
    // that only skips /api and file-extension paths, we're safe.
    app.use((req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path.match(/\.\w+$/)
      ) {
        next();
      } else {
        res.sendFile(path.join(publicDir, 'index.html'));
      }
    });
  }
}

const httpServer = createServer(app);

const port = 5000;
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`serving on port ${port}`);

  // Dynamically import the heavy initialisation bundle so esbuild emits it as a
  // separate chunk (dist/app-init.js). The entry point therefore stays tiny and
  // Node.js binds to port 5000 in milliseconds rather than seconds.
  import('./app-init.js')
    .then(m => m.initializeApp(app, httpServer))
    .then(async () => {
      // Background jobs should run only in local development or explicit singleton worker mode.
      if (shouldRunBackgroundJobs(currentEnv)) {
        const singletonRole = process.env.BACKGROUND_JOBS_ROLE || (currentEnv === 'development' ? 'local-dev' : 'singleton');
        const {
          startScheduledPaymentReminderJob,
          AUTOPAY_RECONCILIATION_INTERVAL_MS,
        } = await import('./services/scheduled-payment-reminders.js');
        console.log(
          `🔧 Starting background services (role=${singletonRole}) — reminders ~6h, AutoPay stuck-processing reconciliation ~${Math.round(
            AUTOPAY_RECONCILIATION_INTERVAL_MS / 60_000,
          )}min; enable this process only on one worker when running multiple web replicas`,
        );

        const { backupService } = await import('./services/backupService.js');
        const { MembershipStatusService } = await import('./services/membership-status-service.js');
        const { startEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
        const { storage } = await import('./storage.js');

        await backupService.init();
        backupService.startAutomaticBackups(24);
        MembershipStatusService.initializeMembershipStatusJob();
        startEnrollmentReminderScheduler();
        startScheduledPaymentReminderJob();

        try {
          await storage.initializeNotifications();
        } catch (error) {
          console.warn('⚠️ Skipping notification initialization in local fallback mode:', (error as Error).message);
        }

        // Graceful platform drain: stop interval-backed work so ticks do not fire during shutdown.
        process.once('SIGTERM', () => {
          void (async () => {
            console.log('🛑 SIGTERM received — stopping background intervals');
            const { backupService: backup } = await import('./services/backupService.js');
            const { MembershipStatusService: MembershipSvc } = await import('./services/membership-status-service.js');
            const { stopEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
            const { stopScheduledPaymentReminderJob } = await import('./services/scheduled-payment-reminders.js');
            backup.stopAutomaticBackups();
            MembershipSvc.stopMembershipStatusJob();
            stopEnrollmentReminderScheduler();
            stopScheduledPaymentReminderJob();
          })();
        });
      } else {
        console.log('☁️ Background jobs disabled for this process');
        console.log(
          '💡 Production/staging (any NODE_ENV except development/test): set ENABLE_BACKGROUND_JOBS=true on exactly one worker with DATABASE_URL; leave it unset/false on web/API replicas so reconciliation and reminders are not double-scheduled',
        );
      }
    })
    .catch(err => console.error('❌ initializeApp failed:', err));
});
