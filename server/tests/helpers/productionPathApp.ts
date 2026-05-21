/**
 * Express app slice matching production mount order for registration / locations.
 */

import express, { type Application } from 'express';
import { configureSession } from '../../config/session';
import { storage } from '../../storage';
import {
  handlePublicLocationsRequest,
  PUBLIC_REGISTRATION_LOCATIONS_PATH,
} from '../../lib/registration-public-locations';

let productionPathAppInstance: Application | null = null;

export async function createProductionPathApp(): Promise<Application> {
  const app = express();

  configureSession(app);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) {
      return next();
    }

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
      // Route middleware returns 401/400 as appropriate.
    }
    next();
  });

  // Same order as server/index.ts — public locations before authenticated routers
  app.get(PUBLIC_REGISTRATION_LOCATIONS_PATH, handlePublicLocationsRequest);
  app.get('/api/locations/public', handlePublicLocationsRequest);

  const locationsRouter = (await import('../../api/locations')).default;
  const authRouter = (await import('../../api/auth')).default;
  const schoolsRouter = (await import('../../api/schools')).default;
  const schoolAdminRouter = (await import('../../api/school-admin')).default;

  app.use('/api/locations', locationsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/schools', schoolsRouter);
  app.use('/api/school-admin', schoolAdminRouter);

  return app;
}

export async function getProductionPathApp(): Promise<Application> {
  if (!productionPathAppInstance) {
    productionPathAppInstance = await createProductionPathApp();
  }
  return productionPathAppInstance;
}

export function resetProductionPathApp(): void {
  productionPathAppInstance = null;
}

/** Production-path tests require Postgres — MemStorage-only mode must not satisfy these suites. */
export async function assertPostgresStorageForProductionPath(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    throw new Error('[production-path] DATABASE_URL is required (no in-memory-only runs).');
  }
  const probeEmail = `pp-probe-${Date.now()}@production-path.invalid`;
  try {
    const existing = await storage.getUserByEmail(probeEmail);
    if (existing) {
      await storage.deleteUser(existing.id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Database connection not available')) {
      throw new Error('[production-path] Storage is not using Postgres — check DATABASE_URL.');
    }
    throw err;
  }
}
