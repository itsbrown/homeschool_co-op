import * as Sentry from '@sentry/node';
import { scrubSentryEvent, SENTRY_IGNORE_ERRORS } from '@shared/sentry-scrub';

let initialized = false;

export function initSentryServer(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const isProd = process.env.NODE_ENV === 'production';
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: isProd ? 0.1 : 1.0,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: scrubSentryEvent,
  });
  initialized = true;
  console.log('✅ Sentry initialized (server)');
}

export function captureServerException(
  error: unknown,
  context?: { route?: string; schoolId?: number; tags?: Record<string, string> },
): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context?.route) scope.setTag('route', context.route);
    if (context?.schoolId != null) scope.setTag('schoolId', String(context.schoolId));
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    Sentry.captureException(error);
  });
}

export function startProgressReportSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!process.env.SENTRY_DSN) return fn();
  return Sentry.startSpan({ name, op: 'progress.report' }, fn);
}

export { Sentry };
