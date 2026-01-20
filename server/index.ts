// Load test environment configuration (conditionally based on NODE_ENV)
import "./test-env-loader";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
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
// REMOVED: stripeWebhookRouter - Insecure endpoint without signature verification
// All webhook events are now handled through the secure /api/stripe/webhook endpoint
import adminEnrollmentPaymentRouter from "./api/admin-enrollment-payment";
import adminRefundsRouter from "./api/admin-refunds";
import membershipRouter from "./api/membership";
import { webhookHandler } from "./webhook-handler";
import userRolesRouter from "./api/user-roles";
import errorTelemetryRouter from "./api/error-telemetry";
import { errorNotificationService } from "./services/error-notification";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import unifiedUploadsRouter from "./api/unified-uploads";
import financialReportsRouter from "./api/financial-reports";

// 🔒 PRODUCTION SAFETY: Verify NODE_ENV is set and log startup environment
const currentEnv = process.env.NODE_ENV || 'development';
console.log('🚀 Server starting in environment:', currentEnv);

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

// CRITICAL: Apply Stripe webhook handler BEFORE any global body parsers
// This ensures webhook signature verification gets the raw buffer
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);

// Standard body parsers for most routes (AFTER webhook handler)
// These are applied to all routes EXCEPT the webhook which is handled above
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size for documents
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

      log(logLine);
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
// REMOVED: /api/stripe-webhooks route - Insecure endpoint without signature verification
// All Stripe webhook events are now routed through /api/stripe/webhook with proper signature verification
app.use("/api/payment-import", paymentImport);
app.use("/api/account-import", accountImport);
app.use("/api/daily-flows", dailyFlowsRoutes);
app.use("/api/user", userRolesRouter); // Multi-role management endpoints
app.use("/api/telemetry/errors", errorTelemetryRouter);
app.use("/api/unified-uploads", unifiedUploadsRouter);

// Register object storage routes for serving uploaded files
registerObjectStorageRoutes(app);

// Initialize error notification service (daily summary scheduler)
errorNotificationService.scheduleDailySummary();

// Ensure critical admin users have proper database roles (removes need for hardcoded email checks)
async function ensureAdminRoles() {
  try {
    const { getDb } = await import('./db');
    const { users, userRoles } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const db = await getDb();
    
    // Admin accounts that need superAdmin + parent roles
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
      
      // Check if superAdmin role exists
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
      
      // Check if parent role exists (for multi-role capability)
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
          // Get enrollment to build description
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

(async () => {
  // Import and apply auth middleware for admin routes
  const { jwtCheck, requireRole } = await import("./middleware/auth0-auth");
  
  // Register admin enrollment payment routes with authentication
  app.use('/api/admin/enrollments', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), adminEnrollmentPaymentRouter);
  
  // Register admin refunds routes with authentication
  app.use('/api/admin/refunds', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), adminRefundsRouter);
  
  // Register financial reports routes with authentication
  app.use('/api/admin/financial-reports', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), financialReportsRouter);
  
  // Register membership admin routes with authentication
  app.use('/api/admin/memberships', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), membershipRouter);
  
  const server = await registerRoutes(app);

  app.use(async (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error('❌ Error handled:', err.message, err.stack);

    // Log error to database for tracking
    try {
      const { storage } = await import('./storage');
      
      // Determine severity based on status code
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (status >= 500) severity = 'high';
      if (status === 500 && (message.includes('payment') || message.includes('stripe'))) severity = 'critical';
      
      // Determine error type
      let errorType: 'frontend' | 'backend' | 'api' | 'database' | 'auth' | 'payment' | 'unknown' = 'api';
      if (message.toLowerCase().includes('auth') || status === 401 || status === 403) errorType = 'auth';
      if (message.toLowerCase().includes('payment') || message.toLowerCase().includes('stripe')) errorType = 'payment';
      if (message.toLowerCase().includes('database') || message.toLowerCase().includes('sql')) errorType = 'database';

      // Extract user info if available
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
        requestBody: null, // Don't log request body for security
        metadata: {},
        status: 'new',
        notificationSent: false,
      });
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
    // Don't throw the error again - this was causing the server to crash
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Ensure critical admin users have proper database roles (runs in all environments)
    // This is idempotent and only adds missing roles
    await ensureAdminRoles();

    // Background jobs and data loading only run in development
    // Autoscale deployments don't support persistent background tasks
    if (currentEnv === 'development' || currentEnv === 'test') {
      console.log('🔧 Development mode: Starting background services...');
      
      // Dynamically import background services to avoid side effects in production
      const { backupService } = await import('./services/backupService.js');
      const { MembershipStatusService } = await import('./services/membership-status-service.js');
      const { startEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
      const { startScheduledPaymentReminderJob } = await import('./services/scheduled-payment-reminders.js');
      const { startCreditExpirationJob } = await import('./services/creditExpirationService.js');
      const { startReconciliationJob } = await import('./services/scheduled-payment-reconciliation-job.js');
      const { storage } = await import('./storage.js');
      
      // Initialize and start backup service
      await backupService.init();
      backupService.startAutomaticBackups(24); // Backup every 24 hours
      
      // Initialize membership status tracking service
      MembershipStatusService.initializeMembershipStatusJob();
      
      // Start enrollment payment reminder scheduler
      startEnrollmentReminderScheduler();
      
      // Start scheduled payment reminder job (sends email reminders for upcoming/overdue payments)
      startScheduledPaymentReminderJob();
      
      // Start credit expiration job (marks expired credits every 12 hours)
      startCreditExpirationJob();
      
      // Start scheduled payment reconciliation job (syncs payment status daily at 3 AM UTC)
      startReconciliationJob();
      
      // Load notifications and notification recipients from JSON into database
      await storage.initializeNotifications();
    } else {
      console.log('☁️ Production mode: Background jobs disabled (not compatible with Autoscale deployments)');
      console.log('💡 Use Scheduled Deployments or Reserved VM for background tasks');
    }
  });
})();