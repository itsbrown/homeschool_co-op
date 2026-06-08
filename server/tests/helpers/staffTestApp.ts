import express, { Router } from 'express';

/**
 * Minimal Express app for staff API integration tests.
 * Routes use supabaseAuth test bypass via `x-test-user-email`.
 */
export function buildStaffTestApp(mounts: { path: string; router: Router }[]): express.Application {
  const app = express();
  app.use(express.json());
  for (const { path, router } of mounts) {
    app.use(path, router);
  }
  return app;
}
