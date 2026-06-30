import * as Sentry from '@sentry/react';
import { scrubSentryEvent, SENTRY_IGNORE_ERRORS } from '@shared/sentry-scrub';

let initialized = false;

export function initSentryClient(): void {
  if (initialized || typeof window === 'undefined') return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  const isProd = import.meta.env.PROD;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || (isProd ? 'production' : 'development'),
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: isProd ? 0.1 : 1.0,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: scrubSentryEvent,
  });
  initialized = true;
}

export function captureClientException(
  error: unknown,
  context?: { severity?: string; correlationId?: string; component?: string },
): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context?.correlationId) scope.setTag('correlationId', context.correlationId);
    if (context?.component) scope.setTag('component', context.component);
    if (context?.severity) scope.setLevel(context.severity === 'critical' ? 'fatal' : 'error');
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export function shouldForwardToSentry(severity?: string, message?: string): boolean {
  if (!import.meta.env.VITE_SENTRY_DSN) return false;
  if (message && SENTRY_IGNORE_ERRORS.some((m) => message.includes(m))) return false;
  return severity === 'medium' || severity === 'high' || severity === 'critical';
}

export { Sentry };
