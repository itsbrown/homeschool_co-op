export const SENTRY_IGNORE_ERRORS = [
  'Script error.',
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
];

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s"']+/gi, replacement: '[REDACTED_SECRET]' },
  { pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /\bsk_(?:live|test)_[A-Za-z0-9]+\b/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { pattern: /\bpi_[A-Za-z0-9]+\b/g, replacement: '[REDACTED_PI]' },
];

function scrubText(value: string): string {
  let out = value;
  for (const { pattern, replacement } of PII_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const keyLower = k.toLowerCase();
      if (['password', 'token', 'authorization', 'cookie', 'ssn'].some((s) => keyLower.includes(s))) {
        next[k] = '[REDACTED]';
      } else {
        next[k] = scrubValue(v);
      }
    }
    return next;
  }
  return value;
}

/** PII-safe scrubber shared by server and client Sentry `beforeSend`. */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T | null {
  const e = event as any;
  if (e.message) e.message = scrubText(String(e.message));
  if (e.exception?.values) {
    for (const ex of e.exception.values) {
      if (ex.value) ex.value = scrubText(String(ex.value));
      if (ex.stacktrace?.frames) {
        for (const frame of ex.stacktrace.frames) {
          if (frame.vars) frame.vars = scrubValue(frame.vars);
        }
      }
    }
  }
  if (e.request) {
    if (e.request.headers) e.request.headers = scrubValue(e.request.headers);
    if (e.request.data) e.request.data = scrubValue(e.request.data);
  }
  if (e.extra) e.extra = scrubValue(e.extra);
  if (e.contexts) e.contexts = scrubValue(e.contexts);
  return event;
}
