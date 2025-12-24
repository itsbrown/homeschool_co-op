/**
 * Best-in-Class Error Tracking Service
 * 
 * Features:
 * - Deduplication: Groups identical errors, tracks occurrence count
 * - Throttling: Max errors per minute to prevent spam
 * - PII Redaction: Scrubs passwords, tokens, emails from payloads
 * - Correlation IDs: Links frontend → backend error chains
 * - Retry Queue: Retries failed logging attempts
 * - Severity Auto-detection: Payment/auth errors = critical, UI errors = low
 * - User context enrichment: Adds session, route, user info
 */

import { v4 as uuidv4 } from 'uuid';

// Types
interface ErrorContext {
  message: string;
  stack?: string;
  url?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  errorType?: 'frontend' | 'backend' | 'api' | 'database' | 'auth' | 'payment';
}

interface ErrorEntry {
  id: string;
  context: ErrorContext;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  reported: boolean;
}

interface QueuedError {
  context: ErrorContext;
  retryCount: number;
  correlationId: string;
}

// Configuration
const CONFIG = {
  THROTTLE_WINDOW_MS: 60000, // 1 minute
  MAX_ERRORS_PER_MINUTE: 10, // Max same error per minute
  MAX_TOTAL_ERRORS_PER_MINUTE: 50, // Max total errors per minute
  DEDUP_WINDOW_MS: 5000, // 5 seconds dedup window for identical errors
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,
  BATCH_DELAY_MS: 1000, // Batch errors before sending
};

// PII patterns to redact
const PII_PATTERNS = [
  { pattern: /password["\s:=]+["']?[^"'\s,}]+["']?/gi, replacement: 'password: "[REDACTED]"' },
  { pattern: /token["\s:=]+["']?[^"'\s,}]+["']?/gi, replacement: 'token: "[REDACTED]"' },
  { pattern: /bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /api[_-]?key["\s:=]+["']?[^"'\s,}]+["']?/gi, replacement: 'api_key: "[REDACTED]"' },
  { pattern: /secret["\s:=]+["']?[^"'\s,}]+["']?/gi, replacement: 'secret: "[REDACTED]"' },
  { pattern: /credit[_-]?card["\s:=]+["']?\d+["']?/gi, replacement: 'credit_card: "[REDACTED]"' },
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '[REDACTED_CARD]' },
  { pattern: /ssn["\s:=]+["']?\d{3}-?\d{2}-?\d{4}["']?/gi, replacement: 'ssn: "[REDACTED]"' },
];

// Severity keywords for auto-detection
const SEVERITY_KEYWORDS = {
  critical: ['payment', 'stripe', 'charge', 'billing', 'subscription', 'auth', 'login', 'session', 'token', 'unauthorized', '401', '403', 'forbidden'],
  high: ['database', 'db', 'sql', 'query', 'connection', 'timeout', '500', '502', '503', 'internal server'],
  medium: ['validation', 'form', 'submit', 'save', 'update', 'create', 'delete', '400', '404', 'not found'],
  low: ['ui', 'render', 'style', 'layout', 'display', 'animation', 'transition'],
};

class ErrorTracker {
  private errorCache: Map<string, ErrorEntry> = new Map();
  private retryQueue: QueuedError[] = [];
  private totalErrorsThisMinute: number = 0;
  private lastMinuteReset: number = Date.now();
  private isProcessingQueue: boolean = false;
  private pendingBatch: QueuedError[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private correlationId: string = '';
  private onNotificationCallback: ((message: string) => void) | null = null;

  constructor() {
    this.correlationId = this.generateCorrelationId();
    this.startRetryProcessor();
    this.startCacheCleanup();
  }

  /**
   * Set callback for showing "Admin notified" confirmation
   */
  setNotificationCallback(callback: (message: string) => void) {
    this.onNotificationCallback = callback;
  }

  /**
   * Generate a unique correlation ID for this session
   */
  private generateCorrelationId(): string {
    try {
      return uuidv4();
    } catch {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Get correlation ID for linking errors
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Create a hash for error deduplication
   */
  private createErrorHash(context: ErrorContext): string {
    const key = `${context.message}|${context.route || ''}|${context.component || ''}|${context.action || ''}`;
    return btoa(encodeURIComponent(key)).slice(0, 32);
  }

  /**
   * Redact PII from text
   */
  private redactPII(text: string): string {
    let redacted = text;
    for (const { pattern, replacement } of PII_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted;
  }

  /**
   * Redact PII from an object recursively
   */
  private redactObject(obj: any, depth = 0): any {
    if (depth > 10) return '[MAX_DEPTH]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.redactPII(obj);
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.redactObject(item, depth + 1));
    
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'creditcard', 'ssn'].includes(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = this.redactObject(value, depth + 1);
      }
    }
    return redacted;
  }

  /**
   * Auto-detect severity based on error message and context
   */
  private detectSeverity(context: ErrorContext): 'low' | 'medium' | 'high' | 'critical' {
    if (context.severity) return context.severity;

    const searchText = `${context.message} ${context.route || ''} ${context.component || ''} ${context.action || ''}`.toLowerCase();

    for (const [severity, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
      if (keywords.some(keyword => searchText.includes(keyword))) {
        return severity as 'low' | 'medium' | 'high' | 'critical';
      }
    }

    // Default based on status code
    if (context.statusCode) {
      if (context.statusCode >= 500) return 'high';
      if (context.statusCode >= 400) return 'medium';
    }

    return 'medium';
  }

  /**
   * Auto-detect error type based on context
   */
  private detectErrorType(context: ErrorContext): 'frontend' | 'backend' | 'api' | 'database' | 'auth' | 'payment' {
    if (context.errorType) return context.errorType;

    const searchText = `${context.message} ${context.route || ''} ${context.action || ''}`.toLowerCase();

    if (searchText.includes('payment') || searchText.includes('stripe') || searchText.includes('billing')) return 'payment';
    if (searchText.includes('auth') || searchText.includes('login') || searchText.includes('session') || searchText.includes('401') || searchText.includes('403')) return 'auth';
    if (searchText.includes('database') || searchText.includes('sql') || searchText.includes('query')) return 'database';
    if (searchText.includes('api') || context.route?.includes('/api/')) return 'api';
    
    return 'frontend';
  }

  /**
   * Check if we should throttle this error
   */
  private shouldThrottle(errorHash: string): boolean {
    // Reset counter every minute
    const now = Date.now();
    if (now - this.lastMinuteReset > CONFIG.THROTTLE_WINDOW_MS) {
      this.totalErrorsThisMinute = 0;
      this.lastMinuteReset = now;
    }

    // Check total errors limit
    if (this.totalErrorsThisMinute >= CONFIG.MAX_TOTAL_ERRORS_PER_MINUTE) {
      console.warn('[ErrorTracker] Total errors per minute limit reached, throttling');
      return true;
    }

    // Check per-error limit
    const cached = this.errorCache.get(errorHash);
    if (cached) {
      const timeSinceFirst = now - cached.firstSeen.getTime();
      if (timeSinceFirst < CONFIG.THROTTLE_WINDOW_MS && cached.count >= CONFIG.MAX_ERRORS_PER_MINUTE) {
        console.warn(`[ErrorTracker] Error "${cached.context.message.slice(0, 50)}..." throttled (${cached.count} occurrences)`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if error is a duplicate within dedup window
   */
  private isDuplicate(errorHash: string): boolean {
    const cached = this.errorCache.get(errorHash);
    if (!cached) return false;
    
    const timeSinceLast = Date.now() - cached.lastSeen.getTime();
    return timeSinceLast < CONFIG.DEDUP_WINDOW_MS;
  }

  /**
   * Get user context for error enrichment
   */
  private getUserContext(): Record<string, any> {
    try {
      const token = localStorage.getItem('supabase_token');
      const activeRole = localStorage.getItem('activeRole');
      
      return {
        hasSession: !!token,
        activeRole: activeRole || null,
        correlationId: this.correlationId,
        sessionStart: sessionStorage.getItem('sessionStart') || new Date().toISOString(),
        pageLoadTime: performance?.timing?.loadEventEnd - performance?.timing?.navigationStart || null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        userAgent: navigator.userAgent,
        language: navigator.language,
        online: navigator.onLine,
        referrer: document.referrer || null,
      };
    } catch {
      return { correlationId: this.correlationId };
    }
  }

  /**
   * Capture and report an error
   */
  async captureError(context: ErrorContext): Promise<boolean> {
    try {
      // Redact PII from context
      const sanitizedContext: ErrorContext = {
        ...context,
        message: this.redactPII(context.message),
        stack: context.stack ? this.redactPII(context.stack) : undefined,
        metadata: context.metadata ? this.redactObject(context.metadata) : undefined,
      };

      // Auto-detect severity and type
      sanitizedContext.severity = this.detectSeverity(sanitizedContext);
      sanitizedContext.errorType = this.detectErrorType(sanitizedContext);

      // Create hash for dedup
      const errorHash = this.createErrorHash(sanitizedContext);

      // Check for duplicate
      if (this.isDuplicate(errorHash)) {
        const cached = this.errorCache.get(errorHash)!;
        cached.count++;
        cached.lastSeen = new Date();
        console.log(`[ErrorTracker] Deduplicated error (count: ${cached.count})`);
        return cached.reported;
      }

      // Check throttling
      if (this.shouldThrottle(errorHash)) {
        return false;
      }

      // Update cache
      const cached = this.errorCache.get(errorHash);
      if (cached) {
        cached.count++;
        cached.lastSeen = new Date();
      } else {
        this.errorCache.set(errorHash, {
          id: errorHash,
          context: sanitizedContext,
          count: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
          reported: false,
        });
      }

      this.totalErrorsThisMinute++;

      // Add to batch for sending
      const queuedError: QueuedError = {
        context: sanitizedContext,
        retryCount: 0,
        correlationId: this.correlationId,
      };

      this.pendingBatch.push(queuedError);

      // Debounce batch sending
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      this.batchTimeout = setTimeout(() => this.processBatch(), CONFIG.BATCH_DELAY_MS);

      return true;
    } catch (err) {
      console.error('[ErrorTracker] Failed to capture error:', err);
      return false;
    }
  }

  /**
   * Process pending batch of errors
   */
  private async processBatch(): Promise<void> {
    if (this.pendingBatch.length === 0) return;

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    for (const queuedError of batch) {
      const success = await this.sendToServer(queuedError);
      if (!success && queuedError.retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
        queuedError.retryCount++;
        this.retryQueue.push(queuedError);
      }
    }
  }

  /**
   * Send error to server
   */
  private async sendToServer(queuedError: QueuedError): Promise<boolean> {
    try {
      const userContext = this.getUserContext();
      const token = localStorage.getItem('supabase_token');

      const response = await fetch('/api/telemetry/errors/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: queuedError.context.message,
          stackTrace: queuedError.context.stack,
          url: queuedError.context.url || window.location.href,
          route: queuedError.context.route || window.location.pathname,
          severity: queuedError.context.severity,
          errorType: queuedError.context.errorType,
          correlationId: queuedError.correlationId,
          metadata: {
            ...queuedError.context.metadata,
            ...userContext,
            component: queuedError.context.component,
            action: queuedError.context.action,
            statusCode: queuedError.context.statusCode,
          },
        }),
      });

      if (response.ok) {
        // Update cache to mark as reported
        const errorHash = this.createErrorHash(queuedError.context);
        const cached = this.errorCache.get(errorHash);
        if (cached) {
          cached.reported = true;
        }

        // Show confirmation toast
        if (this.onNotificationCallback) {
          this.onNotificationCallback('The admin has been notified of this error.');
        }

        return true;
      }

      console.warn('[ErrorTracker] Server responded with:', response.status);
      return false;
    } catch (err) {
      console.error('[ErrorTracker] Failed to send error to server:', err);
      return false;
    }
  }

  /**
   * Process retry queue
   */
  private startRetryProcessor(): void {
    setInterval(async () => {
      if (this.isProcessingQueue || this.retryQueue.length === 0) return;

      this.isProcessingQueue = true;
      const toProcess = this.retryQueue.splice(0, 5); // Process 5 at a time

      for (const queuedError of toProcess) {
        const success = await this.sendToServer(queuedError);
        if (!success && queuedError.retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
          queuedError.retryCount++;
          this.retryQueue.push(queuedError);
        }
      }

      this.isProcessingQueue = false;
    }, CONFIG.RETRY_DELAY_MS);
  }

  /**
   * Clean up old cache entries
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [hash, entry] of this.errorCache.entries()) {
        // Remove entries older than 5 minutes
        if (now - entry.lastSeen.getTime() > 5 * 60 * 1000) {
          this.errorCache.delete(hash);
        }
      }
    }, 60000); // Clean every minute
  }

  /**
   * Get current error stats (for debugging)
   */
  getStats(): { cacheSize: number; queueSize: number; errorsThisMinute: number } {
    return {
      cacheSize: this.errorCache.size,
      queueSize: this.retryQueue.length,
      errorsThisMinute: this.totalErrorsThisMinute,
    };
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

// Helper function for easy error capture
export function captureError(
  message: string,
  options?: Partial<ErrorContext>
): Promise<boolean> {
  return errorTracker.captureError({
    message,
    url: window.location.href,
    route: window.location.pathname,
    ...options,
  });
}

// Helper for capturing API errors
export function captureApiError(
  message: string,
  statusCode: number,
  route: string,
  method: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  return errorTracker.captureError({
    message,
    statusCode,
    route,
    method,
    errorType: 'api',
    severity: statusCode >= 500 ? 'high' : statusCode >= 400 ? 'medium' : 'low',
    metadata,
  });
}

// Set up correlation ID in session storage for page reloads
if (typeof window !== 'undefined') {
  const existingSessionStart = sessionStorage.getItem('sessionStart');
  if (!existingSessionStart) {
    sessionStorage.setItem('sessionStart', new Date().toISOString());
  }
}

export default errorTracker;
