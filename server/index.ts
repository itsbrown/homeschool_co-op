// Load test environment configuration (conditionally based on NODE_ENV)
import "./test-env-loader";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import fileUpload from "express-fileupload";
import path from "path";
import { backupService } from './services/backupService';
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
import { MembershipStatusService } from "./services/membership-status-service.js";
import { dataLayer } from "./services/dataLayer.js";
import { webhookHandler } from "./webhook-handler";

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

// Test endpoint for development - manually update scheduled payment
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
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

    // Initialize and start backup service
    await backupService.init();
    backupService.startAutomaticBackups(24); // Backup every 24 hours
    
    // Initialize membership status tracking service
    MembershipStatusService.initializeMembershipStatusJob();
  });
})();