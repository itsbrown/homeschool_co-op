/**
 * Simplified Test Application
 * Minimal Express app for integration testing without heavy dependencies
 */

import express, { type Request, Response, NextFunction, type Application } from "express";
import { configureSession } from "./config/session";

export async function createSimpleTestApp(): Promise<Application> {
  const app = express();

  // Session middleware
  configureSession(app);

  // Standard body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // Import only the routes we need for testing
  const schoolAdminRouter = await import('./api/school-admin');
  const authRouter = await import('./api/auth');
  
  app.use('/api/school-admin', schoolAdminRouter.default);
  app.use('/api/auth', authRouter.default);

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
