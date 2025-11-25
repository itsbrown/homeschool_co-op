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
import stripeWebhookRouter from "./api/stripe-webhook";
import adminEnrollmentPaymentRouter from "./api/admin-enrollment-payment";
import membershipRouter from "./api/membership";
import { webhookHandler } from "./webhook-handler";
import userRolesRouter from "./api/user-roles";

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
app.use("/api/stripe-webhooks", stripeWebhookRouter);
app.use("/api/payment-import", paymentImport);
app.use("/api/account-import", accountImport);
app.use("/api/daily-flows", dailyFlowsRoutes);
app.use("/api/user", userRolesRouter); // Multi-role management endpoints

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
  // Import and apply auth middleware for admin routes
  const { jwtCheck, requireRole } = await import("./middleware/auth0-auth");
  
  // Register admin enrollment payment routes with authentication
  app.use('/api/admin/enrollments', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), adminEnrollmentPaymentRouter);
  
  // Register membership admin routes with authentication
  app.use('/api/admin/memberships', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), membershipRouter);
  
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

    // Background jobs and data loading only run in development
    // Autoscale deployments don't support persistent background tasks
    if (currentEnv === 'development' || currentEnv === 'test') {
      console.log('🔧 Development mode: Starting background services...');
      
      // Dynamically import background services to avoid side effects in production
      const { backupService } = await import('./services/backupService.js');
      const { MembershipStatusService } = await import('./services/membership-status-service.js');
      const { startEnrollmentReminderScheduler } = await import('./services/enrollmentReminderScheduler.js');
      const { storage } = await import('./storage.js');
      
      // Initialize and start backup service
      await backupService.init();
      backupService.startAutomaticBackups(24); // Backup every 24 hours
      
      // Initialize membership status tracking service
      MembershipStatusService.initializeMembershipStatusJob();
      
      // Start enrollment payment reminder scheduler
      startEnrollmentReminderScheduler();
      
      // Load notifications and notification recipients from JSON into database
      await storage.initializeNotifications();
    } else {
      console.log('☁️ Production mode: Background jobs disabled (not compatible with Autoscale deployments)');
      console.log('💡 Use Scheduled Deployments or Reserved VM for background tasks');
    }
  });
})();