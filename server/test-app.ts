/**
 * Test Application Setup
 * Exports the Express app for integration testing without starting the server
 */

import "./test-env-loader";
import express, { type Request, Response, NextFunction, type Application } from "express";
import { registerRoutes } from "./routes";
import fileUpload from "express-fileupload";
import path from "path";
import { webhookHandler } from "./webhook-handler";

// Import routers
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
import userManagementRouter from "./api/user-management";
import analyticsRouter from "./api/analytics";
import { configureSession } from "./config/session";

/**
 * Create and configure the Express application for testing
 * This is synchronous and doesn't start the server
 */
export async function createTestApp(): Promise<Application> {
  const app = express();

  // CRITICAL: Apply session middleware BEFORE routes
  configureSession(app);

  // CRITICAL: Apply Stripe webhook handler BEFORE any global body parsers
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '5mb' }), webhookHandler);

  // Standard body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // File upload middleware for specific routes
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

  // Serve static files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Register all API routes
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

  // Register parent and admin routes
  app.use('/api/parent', parentRouter);
  app.use('/api/schools', schoolsRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/educator', educatorRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', userManagementRouter);
  
  // Mount analytics router at root to expose /dashboard route
  app.use(analyticsRouter);

  // Register additional routes via registerRoutes
  await registerRoutes(app);

  // Import and apply auth middleware for admin routes
  const { jwtCheck, requireRole } = await import("./middleware/auth0-auth");
  
  app.use('/api/admin/enrollments', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), adminEnrollmentPaymentRouter);
  app.use('/api/admin/memberships', jwtCheck, requireRole(['schoolAdmin', 'admin', 'superAdmin']), membershipRouter);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  return app;
}

// Export a singleton instance for tests
let testAppInstance: Application | null = null;

export async function getTestApp(): Promise<Application> {
  if (!testAppInstance) {
    testAppInstance = await createTestApp();
  }
  return testAppInstance;
}
