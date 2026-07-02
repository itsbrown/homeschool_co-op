import express from 'express';
import telemetryRouter from '../../api/telemetry-activity';
import schoolAnalyticsRouter from '../../api/school-analytics';
import progressAnalyticsRouter from '../../api/progress-analytics';

/** Minimal Express app for school analytics integration tests (x-test-user-email auth). */
export function buildSchoolAnalyticsTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/school-analytics', schoolAnalyticsRouter);
  app.use('/api/progress/analytics', progressAnalyticsRouter);
  return app;
}
