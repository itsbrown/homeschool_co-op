import { type Request, Response, NextFunction } from "express";
import express, { type Express } from "express";
import type { Server } from 'http';
import { initSentryServer } from './lib/sentry';
initSentryServer();
import { registerRoutes } from "./routes";
import { setupVite, log } from "./vite";
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
import aiPricingRouter from "./api/ai-pricing";
import stripeMigrationRouter from "./api/stripe-migration";
import adminEnrollmentPaymentRouter from "./api/admin-enrollment-payment";
import adminEnrollmentsRouter from "./api/admin-enrollments";
import { FINANCIAL_ADMIN_ROLES } from "./lib/auth-roles";
import adminRefundsRouter from "./api/admin-refunds";
import membershipRouter from "./api/membership";
import { webhookHandler } from "./webhook-handler";
import userRolesRouter from "./api/user-roles";
import autoPayRouter, { adminPaymentMethodsRouter } from "./api/auto-pay";
import errorTelemetryRouter from "./api/error-telemetry";
import sendgridWebhookRouter from "./api/sendgrid-webhook";
import { errorNotificationService } from "./services/error-notification";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import unifiedUploadsRouter from "./api/unified-uploads";
import financialReportsRouter, {
  balanceAuditAliasRouter,
  creditDivergenceAuditAliasRouter,
} from "./api/financial-reports";
import retentionRouter from "./api/retention";
import scheduleBuilderRouter from "./api/schedule-builder";
import scheduleAiRouter from "./api/schedule-ai";
import assessmentsRouter from "./api/assessments";
import lexileRouter from "./api/lexile";
import lexileAiRouter from "./api/lexile-ai";
import assessmentUploadRouter from "./api/assessment-upload";
import progressRouter from "./api/progress";
import progressInsightsRouter from "./api/progress-insights";
import locationEnrollmentsRouter from "./api/location-enrollments";

async function ensureAdminRoles(): Promise<void> {
  try {
    const { getDb } = await import('./db');
    const { users, userRoles } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const db = await getDb();

    const adminEmails = [
      'corey@americanseekersacademy.com',
      'superadmin@americanseekersacademy.com',
    ];

    for (const email of adminEmails) {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        console.log(`⚠️ Admin user not found: ${email}`);
        continue;
      }

      const [superAdminRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, 'superAdmin')))
        .limit(1);

      if (!superAdminRole) {
        await db.insert(userRoles).values({
          userId: user.id,
          role: 'superAdmin',
          schoolId: user.schoolId,
          isPrimary: true,
        });
        console.log(`✅ Added superAdmin role for ${email}`);
      }

      const [parentRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, 'parent')))
        .limit(1);

      if (!parentRole) {
        await db.insert(userRoles).values({
          userId: user.id,
          role: 'parent',
          schoolId: user.schoolId,
          isPrimary: false,
        });
        console.log(`✅ Added parent role for ${email}`);
      }
    }

    console.log('✅ Admin roles verification complete');
  } catch (error) {
    console.error('❌ Failed to ensure admin roles:', error);
  }
}

export async function initializeApp(app: Express, httpServer: Server): Promise<void> {
  const currentEnv = process.env.NODE_ENV || 'development';

  // CRITICAL: Apply Stripe webhook handler BEFORE any global body parsers.
  // This ensures webhook signature verification gets the raw buffer.
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);

  // Standard body parsers for most routes (AFTER webhook handler)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // fileUpload middleware — scoped to specific routes only
  app.use('/api/school-admin/contact-import', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/school-admin/import-users', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/schools/upload-logo', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/schools/documents/upload', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 25 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/custom-forms/forms/:formId/upload-attachment', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  // Serve static files from uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (reqPath.startsWith("/api")) {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }
        log(logLine);
      }
    });

    next();
  });

  app.use('/api/admin/upload/classes', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/school-admin/upload/classes', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  app.use('/api/file-upload', fileUpload({
    useTempFiles: false,
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
  }));

  // Register routers
  app.use('/api/file-upload', fileUploadRouter);
  app.use('/api/school-admin/marketing-links', marketingLinksRouter);
  app.use('/api/school-parents', schoolParentsRouter);
  app.use('/api/payments', paymentHistoryRouter);
  app.use('/api/stripe', stripeRoutes);
  app.use("/api/billing", billingRouter);
  app.use("/api/scheduled-payments", scheduledPaymentsRouter);
  app.use("/api/ai-pricing", aiPricingRouter);
  app.use("/api/stripe-migration", stripeMigrationRouter);
  app.use("/api/payment-import", paymentImport);
  app.use("/api/account-import", accountImport);
  app.use("/api/user", userRolesRouter);
  app.use("/api/user", autoPayRouter);
  app.use("/api/admin/users", adminPaymentMethodsRouter);
  app.use("/api/telemetry/errors", errorTelemetryRouter);
  app.use("/api/webhooks/sendgrid", sendgridWebhookRouter);
  app.use("/api/unified-uploads", unifiedUploadsRouter);
  app.use("/api/schedule-builder", scheduleBuilderRouter);
  app.use("/api/schedule-ai", scheduleAiRouter);
  app.use("/api/assessments", assessmentsRouter);
  app.use("/api/lexile", lexileRouter);
  app.use("/api/lexile", lexileAiRouter);
  app.use("/api/assessment-upload", assessmentUploadRouter);
  app.use("/api/progress", progressRouter);
  app.use("/api/progress/insights", progressInsightsRouter);
  app.use("/api/location-enrollments", locationEnrollmentsRouter);

  // Register object storage routes for serving uploaded files
  registerObjectStorageRoutes(app);

  // Initialize error notification service (daily summary scheduler)
  errorNotificationService.scheduleDailySummary();

  // Test endpoints for development/test environments only
  if (currentEnv === 'development' || currentEnv === 'test') {
    app.post('/api/test/trigger-enrollment-reminders', async (req, res) => {
      try {
        const { processEnrollmentReminders, getPendingPaymentEnrollments } = await import('./services/enrollmentReminderScheduler');

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

        if (req.query.force === 'true') {
          const { getDb } = await import('./db');
          const db = await getDb();
          const { schoolClassEnrollments } = await import('@shared/schema');
          const { eq } = await import('drizzle-orm');

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
          const scheduledPayment = (await storage.getScheduledPaymentsByParentEmail('tester@testing321.com')).find(p => p.id === id);
          if (scheduledPayment) {
            const enrollment = await storage.getProgramEnrollmentById(scheduledPayment.enrollmentId);
            const childName = enrollment?.childName || 'Child';
            const className = enrollment?.className || 'Unknown Class';

            const paymentRecord = {
              schoolId: scheduledPayment.schoolId,
              parentId: scheduledPayment.parentId || null,
              stripePaymentIntentId: `pi_test_dev_${id}`,
              stripeChargeId: null,
              stripeRefundId: null,
              originalPaymentId: null,
              parentEmail: scheduledPayment.parentEmail,
              childName: childName,
              className: className,
              description: `Test payment for scheduled payment ${id}`,
              amount: scheduledPayment.amount,
              currency: scheduledPayment.currency || 'usd',
              status: 'completed' as const,
              enrollmentIds: [scheduledPayment.enrollmentId],
              metadata: { testPayment: true, scheduledPaymentId: id },
              paymentDate: new Date()
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

  // Import auth middleware for protected admin routes
  const { jwtCheck, requireRole } = await import("./middleware/auth0-auth");
  const { supabaseAuth } = await import("./middleware/supabase-auth");
  const adminEnrollmentRoles = [...FINANCIAL_ADMIN_ROLES];

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
  app.use('/api/admin/refunds', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), adminRefundsRouter);
  // Financial reports: supabaseAuth + in-router admin/feature checks (matches /api/school-admin)
  app.use('/api/admin/financial-reports', supabaseAuth, financialReportsRouter);
  app.use('/api/admin/balance-audit', supabaseAuth, balanceAuditAliasRouter);
  app.use('/api/admin/credit-divergence-audit', supabaseAuth, creditDivergenceAuditAliasRouter);
  app.use('/api/admin/retention', supabaseAuth, retentionRouter);
  app.use('/api/admin/memberships', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), membershipRouter);

  // Register all remaining routes (pass existing server — avoids creating a second HTTP server)
  await registerRoutes(app, httpServer);

  // Global error handler — must be registered after all routes
  app.use(async (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error('❌ Error handled:', err.message, err.stack);

    try {
      const { storage } = await import('./storage');

      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (status >= 500) severity = 'high';
      if (status === 500 && (message.includes('payment') || message.includes('stripe'))) severity = 'critical';

      let errorType: 'frontend' | 'backend' | 'api' | 'database' | 'auth' | 'payment' | 'unknown' = 'api';
      if (message.toLowerCase().includes('auth') || status === 401 || status === 403) errorType = 'auth';
      if (message.toLowerCase().includes('payment') || message.toLowerCase().includes('stripe')) errorType = 'payment';
      if (message.toLowerCase().includes('database') || message.toLowerCase().includes('sql')) errorType = 'database';

      const userEmail = (req as any).user?.email || (req as any).auth?.payload?.email;
      const userId = (req as any).user?.id;
      const schoolId = (req as any).user?.schoolId;

      await storage.createErrorLog({
        errorType,
        severity,
        message: message.substring(0, 500),
        stackTrace: err.stack?.substring(0, 5000) || null,
        errorCode: status.toString(),
        url: req.originalUrl,
        route: req.route?.path || req.path,
        method: req.method,
        userId: userId ?? null,
        userEmail: userEmail ?? null,
        schoolId: schoolId ?? null,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || null,
        userAgent: req.headers['user-agent'] || null,
        requestBody: null,
        metadata: {},
        status: 'new',
        notificationSent: false,
      });
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
  });

  // Static file serving / Vite — catch-all, must be last
  // In production, static serving is handled in server/index.ts before listen()
  // so GET / responds immediately for health checks. Only set up Vite in dev.
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  }

  // DB migrations — idempotent, safe to run in background after listen
  (async () => {
    try {
      const { initializeDatabase } = await import('./init-db.js');
      await initializeDatabase();
    } catch (err) {
      console.error('⚠️ initializeDatabase failed (non-fatal):', err);
    }
  })();

  // Admin role seeding — idempotent, safe to run in background
  ensureAdminRoles().catch(err =>
    console.error('⚠️ ensureAdminRoles failed (non-fatal):', err)
  );

  // Background schedulers — Reserved VM keeps the process alive between runs
  console.log(`🔧 Starting background services (${currentEnv})...`);

  // Deployment safety: PAYMENT_PROCESSOR_ENABLED controls unified payment processing.
  // Without it, webhook idempotency relies solely on the stripe_payment_history DB lookup.
  if (process.env.PAYMENT_PROCESSOR_ENABLED !== 'true') {
    console.warn('WARN: PAYMENT_PROCESSOR_ENABLED is not set to "true". Webhook idempotency protection is reduced (relying solely on stripe_payment_history DB lookup). Set PAYMENT_PROCESSOR_ENABLED=true on Reserved VM deployments.');
  }

  // Deployment safety note: startAutoPayJob() and startReconciliationJob() require
  // AUTO_PAY_SINGLE_INSTANCE=true to start. Both jobs will emit a CRITICAL log and
  // refuse to start if this env var is missing — preventing double-charges in
  // autoscaled deployments. Set AUTO_PAY_SINGLE_INSTANCE=true only on Reserved VM.

  const { backupService } = await import('./services/backupService.js');
  const { MembershipStatusService } = await import('./services/membership-status-service.js');
  const { startEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
  const { startScheduledPaymentReminderJob } = await import('./services/scheduled-payment-reminders.js');
  const { startCreditExpirationJob } = await import('./services/creditExpirationService.js');
  const { startReconciliationJob } = await import('./services/scheduled-payment-reconciliation-job.js');
  const { startPaymentFlowMonitorJob } = await import('./services/payment-flow-monitor-job.js');
  const { storage } = await import('./storage.js');

  await backupService.init();
  backupService.startAutomaticBackups(24);

  MembershipStatusService.initializeMembershipStatusJob();
  startEnrollmentReminderScheduler();
  startScheduledPaymentReminderJob();
  startCreditExpirationJob();
  startReconciliationJob();
  startPaymentFlowMonitorJob();

  const { startAutoPayJob } = await import('./services/auto-pay-scheduler.js');
  startAutoPayJob();

  storage.initializeNotifications().catch(err =>
    console.error('⚠️ initializeNotifications failed (non-fatal):', err)
  );
}
