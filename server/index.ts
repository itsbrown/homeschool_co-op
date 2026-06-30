// Load repo-root `.env` / `.env.local` first (local Mac/Linux; Replit/CI already set env).
import "./local-env";
// Load test environment configuration (conditionally based on NODE_ENV)
import "./test-env-loader";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import fileUpload from "express-fileupload";
import path from "path";
import fileUploadRouter from './api/file-upload';
import paymentHistoryRouter from './api/payment-history';
import stripeRoutes from './api/stripe';
import marketingLinksRouter from './api/marketing-links';
import parentRouter from './api/parent';
import billingRouter from './api/billing';
import scheduledPaymentsRouter from './api/scheduled-payments';
import schoolsRouter from "./api/schools";
import studentsRouter from "./api/students";
import schoolParentsRouter from "./api/school-parents";
import educatorRouter from "./api/educator";
import authRouter from "./api/auth";
import paymentImport from "./api/payment-import";
import accountImport from "./api/account-import";
import dailyFlowsRoutes from "./api/daily-flows";
import aiPricingRouter from "./api/ai-pricing";
import stripeMigrationRouter from "./api/stripe-migration";
import stripeWebhookRouter from "./api/stripe-webhook";
import adminEnrollmentPaymentRouter from "./api/admin-enrollment-payment";
import adminEnrollmentsRouter from "./api/admin-enrollments";
import { FINANCIAL_ADMIN_ROLES } from "./lib/auth-roles";
import membershipRouter from "./api/membership";
import { webhookHandler } from "./webhook-handler";
import userRolesRouter from "./api/user-roles";
import autoPayRouter, { adminPaymentMethodsRouter } from "./api/auto-pay";
import cartRouter from "./api/cart";
import progressRouter from "./api/progress";
import progressInsightsRouter from "./api/progress-insights";
import locationEnrollmentsRouter from "./api/location-enrollments";
import publicStoreRouter from './api/public-store';
import storeAdminRouter from './api/store-admin';
import { getDb } from "./db";
import { getNormalizedDatabaseUrl } from "./lib/database-url";

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
  if (process.env.PLAYWRIGHT_WEB_SERVER === 'true') return false;
  if (env === 'development') return true;

  // Production/staging safety: background jobs run only with explicit singleton opt-in.
  // This avoids accidental multi-replica schedulers in autoscaled web fleets.
  return parseBooleanEnv(process.env.ENABLE_BACKGROUND_JOBS, false);
}

if (currentEnv === 'production') {
  console.log('✅ Production mode: Database fallbacks disabled, test authentication blocked');
  // Verify critical production environment variables are set
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

// CRITICAL: Apply Stripe webhook handler BEFORE any global body parsers
// This ensures webhook signature verification gets the raw buffer
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);

// Standard body parsers for most routes (AFTER webhook handler)
// These are applied to all routes EXCEPT the webhook which is handled above
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.get('/api/health', async (_req, res) => {
  const hasDatabaseUrl = Boolean(getNormalizedDatabaseUrl());
  const hasSupabase =
    Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  let dbOk = false;
  let dbError: string | null = null;
  if (hasDatabaseUrl) {
    try {
      await getDb();
      dbOk = true;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk && hasSupabase,
    db: dbOk ? 'connected' : dbError || 'not configured',
    hasDatabaseUrl,
    hasSupabase,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

// Apply fileUpload middleware only to file upload routes
app.use('/api/school-admin/contact-import', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  abortOnLimit: true,
  createParentPath: true,
}));

app.use('/api/school-admin/import-users', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  abortOnLimit: true,
  createParentPath: true,
}));

// Apply fileUpload middleware for school logo uploads
app.use('/api/schools/upload-logo', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size for logos
  abortOnLimit: true,
  createParentPath: true,
}));

// Apply fileUpload middleware for school document uploads
app.use('/api/schools/documents/upload', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size for documents
  abortOnLimit: true,
  createParentPath: true,
}));

// Custom form public attachments (e.g. resume on mentor application)
app.use('/api/custom-forms/forms/:formId/upload-attachment', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
}));

// Public store merch product images
app.use('/api/school-admin/public-store/upload', fileUpload({
  useTempFiles: false,
  limits: { fileSize: 5 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
}));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

// Register file upload routes
app.use('/api/file-upload', fileUploadRouter);
app.use('/api/school-admin/marketing-links', marketingLinksRouter);
app.use('/api/school-parents', schoolParentsRouter);
app.use('/api/payments', paymentHistoryRouter);
app.use('/api/stripe', stripeRoutes);
app.use("/api/billing", billingRouter);
app.use("/api/scheduled-payments", scheduledPaymentsRouter);
app.use("/api/ai-pricing", aiPricingRouter);
app.use("/api/stripe-migration", stripeMigrationRouter);
app.use("/api/stripe-webhooks", stripeWebhookRouter);
app.use("/api/payment-import", paymentImport);
app.use("/api/account-import", accountImport);
app.use("/api/daily-flows", dailyFlowsRoutes);
app.use("/api/user", userRolesRouter); // Multi-role management endpoints
app.use("/api/user", autoPayRouter); // Payment methods + auto-pay (same /api/user prefix)
app.use("/api/admin/users", adminPaymentMethodsRouter);
// Cart pricing (snapshot / calculate / validate). Each route applies supabaseAuth.
// Must be registered on the Express app — otherwise /api/cart/* falls through to Vite
// and returns HTML, which breaks checkout with "Unexpected token '<'" JSON errors.
app.use("/api/cart", cartRouter);
app.use("/api/progress", progressRouter);
app.use("/api/progress/insights", progressInsightsRouter);
app.use("/api/location-enrollments", locationEnrollmentsRouter);
app.use("/api/public/store", publicStoreRouter);
app.use("/api/school-admin/public-store", storeAdminRouter);

// Test endpoints for development
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  // Manually trigger enrollment reminder check
  app.post('/api/test/trigger-enrollment-reminders', async (req, res) => {
    try {
      const { processEnrollmentReminders, getPendingPaymentEnrollments } = await import('./services/enrollmentReminderScheduler');
      
      // Option to just get pending enrollments without sending (for preview)
      if (req.query.preview === 'true') {
        const pending = await getPendingPaymentEnrollments();
        return res.json({ 
          success: true, 
          preview: true,
          pendingEnrollments: pending.map(e => ({
            enrollmentId: e.enrollmentId,
            childName: e.childName,
            className: e.className,
            parentEmail: e.parentEmail,
            reminderCount: e.reminderCount,
            lastReminderSentAt: e.lastReminderSentAt,
          }))
        });
      }
      
      // Force send reminders (bypasses throttle check for testing)
      if (req.query.force === 'true') {
        const { getDb } = await import('./db');
        const db = await getDb();
        const { schoolClassEnrollments } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        
        // Reset reminder tracking to allow immediate send
        await db.update(schoolClassEnrollments)
          .set({ lastReminderSentAt: null, reminderCount: 0 })
          .where(eq(schoolClassEnrollments.status, 'pending_payment'));
        console.log('🔄 Reset reminder tracking for all pending_payment enrollments');
      }
      
      const stats = await processEnrollmentReminders();
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error('Error triggering enrollment reminders:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/test/update-scheduled-payment', async (req, res) => {
    try {
      const { id, status } = req.body;
      const { storage } = await import('./storage');
      const payment = await storage.updateScheduledPaymentStatus(id, status);

      if (status === 'paid') {
        // Also create payment history record
        const scheduledPayment = (await storage.getScheduledPaymentsByParentEmail('tester@testing321.com')).find(p => p.id === id);
        if (scheduledPayment) {
          const paymentRecord = {
            id: Date.now(),
            stripePaymentIntentId: `pi_test_dev_${id}`,
            parentEmail: scheduledPayment.parentEmail,
            childName: scheduledPayment.description?.split(' - ')[0] || 'Child',
            className: scheduledPayment.description?.split(' - ')[1] || scheduledPayment.description || 'Unknown Class',
            amount: scheduledPayment.amount,
            currency: scheduledPayment.currency || 'usd',
            status: 'completed' as const,
            metadata: { testPayment: true, scheduledPaymentId: id },
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await storage.createPayment(paymentRecord);
          console.log('✅ Test: Created payment history record');
        }
      }

      res.json({ success: true, payment });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

}

(async () => {
  try {
  // Import and apply auth middleware for admin routes
  const { supabaseAuth } = await import("./middleware/supabase-auth");
  const { jwtCheck, requireRole } = await import("./middleware/auth0-auth");
  const adminEnrollmentRoles = [...FINANCIAL_ADMIN_ROLES];

  // Comp, waitlist promote, etc. (admin-enrollments) + payment-plan/reallocate (admin-enrollment-payment)
  app.use(
    '/api/admin/enrollments',
    supabaseAuth,
    requireRole(adminEnrollmentRoles),
    adminEnrollmentsRouter,
  );
  app.use(
    '/api/admin/enrollments',
    supabaseAuth,
    requireRole(adminEnrollmentRoles),
    adminEnrollmentPaymentRouter,
  );
  
  // Register membership admin routes with authentication
  app.use('/api/admin/memberships', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), membershipRouter);

  // Parent registration campuses — before registerRoutes() so nothing auth-wraps these paths
  const { handlePublicLocationsRequest, PUBLIC_REGISTRATION_LOCATIONS_PATH } = await import(
    './lib/registration-public-locations',
  );
  app.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, handlePublicLocationsRequest);
  app.get('/api/locations/public', handlePublicLocationsRequest);
  console.log('📍 Public registration locations: read-only (Main Campus auto-seed disabled)');
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error('❌ Error handled:', err.message, err.stack);
    // Don't throw the error again - this was causing the server to crash
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "test") {
    // Jest imports app/server routes only; skip vite/static client wiring.
  } else if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite");
    try {
      serveStatic(app);
    } catch (staticError) {
      console.error('❌ Failed to configure static file serving:', staticError);
      throw staticError;
    }
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const port = 5000;
  const listenOpts: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
  };
  // SO_REUSEPORT is unsupported on some platforms/sandboxes; Playwright sets DISABLE_LISTEN_REUSE_PORT.
  if (process.env.DISABLE_LISTEN_REUSE_PORT !== "true") {
    listenOpts.reusePort = true;
  }
  server.listen(listenOpts, async () => {
    console.log(`serving on port ${port}`);

    // Background jobs should run only in local development or explicit singleton worker mode.
    if (shouldRunBackgroundJobs(currentEnv)) {
      const singletonRole = process.env.BACKGROUND_JOBS_ROLE || (currentEnv === 'development' ? 'local-dev' : 'singleton');
      // Dynamically import background services to avoid side effects in production
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
      const { startCreditExpirationJob, stopCreditExpirationJob } = await import(
        './services/creditExpirationService.js'
      );
      const { storage } = await import('./storage.js');
      
      // Initialize and start backup service
      await backupService.init();
      backupService.startAutomaticBackups(24); // Backup every 24 hours
      
      // Initialize membership status tracking service
      MembershipStatusService.initializeMembershipStatusJob();
      
      // Start enrollment payment reminder scheduler
      startEnrollmentReminderScheduler();

      startCreditExpirationJob();
      
      // Start scheduled payment reminder job (sends email reminders for upcoming/overdue payments)
      startScheduledPaymentReminderJob();

      const { startLocationActivationScheduler } = await import(
        './services/location-activation-scheduler.js'
      );
      startLocationActivationScheduler();
      
      // Load notifications and notification recipients from JSON into database.
      // In local fallback mode, DB may be unavailable; do not crash server startup.
      try {
        await storage.initializeNotifications();
      } catch (error) {
        console.warn('⚠️ Skipping notification initialization in local fallback mode:', (error as Error).message);
      }

      // Graceful platform drain: stop interval-backed work so ticks do not fire during shutdown,
      // then close the HTTP server and exit so port 5000 is released promptly for the next restart.
      // Without an explicit exit, registering a SIGTERM listener suppresses Node's default termination,
      // causing the process to linger until SIGKILL and intermittently blocking port 5000 on cold restart.
      // SIGINT is intentionally not handled here so interactive dev Ctrl+C keeps default termination.
      process.once('SIGTERM', () => {
        void (async () => {
          console.log('🛑 SIGTERM received — stopping background intervals');
          try {
            const { backupService: backup } = await import('./services/backupService.js');
            const { MembershipStatusService: MembershipSvc } = await import('./services/membership-status-service.js');
            const { stopEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
            const { stopScheduledPaymentReminderJob } = await import('./services/scheduled-payment-reminders.js');
            const { stopCreditExpirationJob } = await import('./services/creditExpirationService.js');
            const { stopLocationActivationScheduler } = await import(
              './services/location-activation-scheduler.js'
            );
            backup.stopAutomaticBackups();
            MembershipSvc.stopMembershipStatusJob();
            stopEnrollmentReminderScheduler();
            stopScheduledPaymentReminderJob();
            stopCreditExpirationJob();
            stopLocationActivationScheduler();
          } catch (err) {
            console.warn('⚠️ Error while stopping background intervals:', (err as Error).message);
          }
          // Close the HTTP server so the listening socket on port 5000 is released before exit.
          const closeTimer = setTimeout(() => {
            console.warn('⏱️ HTTP server close timed out — forcing exit');
            process.exit(0);
          }, 3000);
          server.close(() => {
            clearTimeout(closeTimer);
            console.log('✅ HTTP server closed — exiting');
            process.exit(0);
          });
        })();
      });
    } else {
      console.log('☁️ Background jobs disabled for this process');
      console.log(
        '💡 Production/staging (any NODE_ENV except development/test): set ENABLE_BACKGROUND_JOBS=true on exactly one worker with DATABASE_URL; leave it unset/false on web/API replicas so reconciliation and reminders are not double-scheduled',
      );
    }
  });
  } catch (startupError) {
    console.error('❌ Fatal server startup error:', startupError);
    process.exit(1);
  }
})();