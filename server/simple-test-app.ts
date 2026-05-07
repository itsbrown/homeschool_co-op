/**
 * Simplified Test Application
 * Minimal Express app for integration testing without heavy dependencies
 */

import express, { type Request, Response, NextFunction, type Application } from "express";
import { configureSession } from "./config/session";
import { storage } from "./storage";

export async function createSimpleTestApp(): Promise<Application> {
  const app = express();

  // Session middleware
  configureSession(app);

  // Standard body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // Test-only auth shim: allow lightweight app routes protected by supabaseAuth
  // to use x-test-user-email without requiring full auth/login flows.
  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) return next();

    try {
      const user = await storage.getUserByEmail(String(testUserEmail));
      if (user) {
        req.session = req.session || {};
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.user = {
          id: user.id,
          email: user.email,
          sub: user.supabaseId || String(user.id),
          role: user.role,
          permissions: user.permissions,
          schoolId: user.schoolId,
          name: user.name,
        };
      }
    } catch {
      // Ignore lookup failures; route auth middleware will return 401 as expected.
    }
    next();
  });

  // Import only the routes we need for testing
  const schoolAdminRouter = await import('./api/school-admin');
  const authRouter = await import('./api/auth');
  const stripeRouter = await import('./api/stripe');
  
  app.use('/api/school-admin', schoolAdminRouter.default);
  app.use('/api/auth', authRouter.default);
  app.use('/api/stripe', stripeRouter.default);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  console.log('✅ Simple test app created');
  return app;
}

// Export a singleton instance for tests
let testAppInstance: Application | null = null;

export async function getSimpleTestApp(): Promise<Application> {
  if (!testAppInstance) {
    testAppInstance = await createSimpleTestApp();
  }
  return testAppInstance;
}

// Reset for test isolation
export function resetTestApp(): void {
  testAppInstance = null;
}
