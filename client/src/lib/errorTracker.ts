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
 * - Rich Context: Navigation breadcrumbs, user/school context, session metrics,
 *                 network quality, form context, user action history
 * - Safe Event Listeners: All DOM event handlers wrapped in try-catch to prevent
 *                         interference with application behavior
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

interface BreadcrumbEntry {
  url: string;
  route: string;
  title: string;
  timestamp: number;
  timeOnPage?: number;
}

interface UserAction {
  type: 'click' | 'input' | 'submit' | 'navigation' | 'scroll';
  target: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface NetworkInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

interface FormContext {
  formId?: string;
  formName?: string;
  fieldNames: string[];
  hasValidationErrors: boolean;
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
  MAX_BREADCRUMBS: 5, // Last N pages visited
  MAX_USER_ACTIONS: 10, // Last N user actions
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
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
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
  
  // Enhanced tracking
  private breadcrumbs: BreadcrumbEntry[] = [];
  private userActions: UserAction[] = [];
  private sessionErrorCount: number = 0;
  private pageEntryTime: number = Date.now();
  private currentFormContext: FormContext | null = null;
  private lastScrollPosition: number = 0;

  constructor() {
    this.correlationId = this.generateCorrelationId();
    this.startRetryProcessor();
    this.startCacheCleanup();
    this.initializeTracking();
  }

  /**
   * Initialize page tracking and event listeners
   * All event handlers are wrapped in try-catch to ensure they never
   * interfere with normal application behavior
   */
  private initializeTracking(): void {
    if (typeof window === 'undefined') return;

    // Track initial page (safe)
    try {
      this.recordPageVisit();
    } catch {
      // Silently fail - tracking is non-critical
    }

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'hidden') {
          this.updateCurrentBreadcrumbTimeOnPage();
        }
      } catch {
        // Silently fail
      }
    });

    // Track navigation
    window.addEventListener('popstate', () => {
      try {
        this.updateCurrentBreadcrumbTimeOnPage();
        this.recordPageVisit();
      } catch {
        // Silently fail
      }
    });

    // Track clicks (delegated) - MUST NOT throw to avoid breaking clicks
    document.addEventListener('click', (e) => {
      try {
        const target = e.target;
        if (target && typeof target === 'object') {
          this.recordUserAction('click', this.getElementDescriptor(target as HTMLElement));
        }
      } catch {
        // Silently fail - never interrupt user clicks
      }
    }, { capture: true, passive: true });

    // Track form inputs (without values) - MUST NOT throw
    document.addEventListener('input', (e) => {
      try {
        const target = e.target;
        if (target && typeof target === 'object') {
          const el = target as HTMLElement;
          const tagName = el.tagName?.toUpperCase();
          if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            this.recordUserAction('input', this.getElementDescriptor(el));
            this.updateFormContext(el);
          }
        }
      } catch {
        // Silently fail - never interrupt form inputs
      }
    }, { capture: true, passive: true });

    // Track form submissions - MUST NOT throw
    document.addEventListener('submit', (e) => {
      try {
        const target = e.target;
        if (target && typeof target === 'object') {
          const form = target as HTMLFormElement;
          this.recordUserAction('submit', this.getElementDescriptor(form), {
            formId: form.id || undefined,
            formName: form.name || undefined,
          });
        }
      } catch {
        // Silently fail - never interrupt form submissions
      }
    }, { capture: true, passive: true });

    // Track scroll (throttled)
    let scrollTimeout: ReturnType<typeof setTimeout>;
    window.addEventListener('scroll', () => {
      try {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          try {
            const bodyHeight = document.body?.scrollHeight || 1;
            const scrollPos = Math.round(window.scrollY / bodyHeight * 100);
            if (Math.abs(scrollPos - this.lastScrollPosition) > 25) {
              this.recordUserAction('scroll', `${scrollPos}%`);
              this.lastScrollPosition = scrollPos;
            }
          } catch {
            // Silently fail
          }
        }, 500);
      } catch {
        // Silently fail
      }
    }, { passive: true });
  }

  /**
   * Get a descriptor for an element (type, id, class, data-testid)
   * Defensive: handles null, SVG, and other edge cases
   */
  private getElementDescriptor(element: HTMLElement | null | undefined): string {
    try {
      if (!element) return 'unknown';
      
      // Handle SVG elements and other non-standard elements
      const tag = element.tagName?.toLowerCase() || 'unknown';
      
      // Try data-testid first (most reliable)
      try {
        const testId = element.getAttribute?.('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
      } catch {
        // Continue to other methods
      }
      
      // Try id
      const id = element.id;
      if (id && typeof id === 'string') return `${tag}#${id}`;
      
      // Try className (SVG elements may have className as SVGAnimatedString)
      const className = element.className;
      if (className && typeof className === 'string' && className.trim()) {
        const firstClass = className.split(' ')[0];
        if (firstClass) return `${tag}.${firstClass}`;
      }
      
      // Try type for inputs
      try {
        const type = (element as HTMLInputElement).type;
        if (type && typeof type === 'string') return `${tag}[type="${type}"]`;
      } catch {
        // Continue
      }
      
      return tag;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Record a user action - safe, never throws
   */
  private recordUserAction(type: UserAction['type'], target: string, metadata?: Record<string, any>): void {
    try {
      this.userActions.push({
        type,
        target: target || 'unknown',
        timestamp: Date.now(),
        metadata,
      });

      // Keep only last N actions
      if (this.userActions.length > CONFIG.MAX_USER_ACTIONS) {
        this.userActions = this.userActions.slice(-CONFIG.MAX_USER_ACTIONS);
      }
    } catch {
      // Silently fail
    }
  }

  /**
   * Record a page visit as a breadcrumb
   */
  recordPageVisit(url?: string, route?: string): void {
    try {
      this.updateCurrentBreadcrumbTimeOnPage();
      
      const entry: BreadcrumbEntry = {
        url: url || window.location?.href || '',
        route: route || window.location?.pathname || '',
        title: document?.title || '',
        timestamp: Date.now(),
      };

      this.breadcrumbs.push(entry);
      this.pageEntryTime = Date.now();

      // Keep only last N breadcrumbs
      if (this.breadcrumbs.length > CONFIG.MAX_BREADCRUMBS) {
        this.breadcrumbs = this.breadcrumbs.slice(-CONFIG.MAX_BREADCRUMBS);
      }

      // Record as navigation action
      this.recordUserAction('navigation', entry.route);
    } catch {
      // Silently fail
    }
  }

  /**
   * Update time-on-page for current breadcrumb
   */
  private updateCurrentBreadcrumbTimeOnPage(): void {
    try {
      if (this.breadcrumbs.length > 0) {
        const current = this.breadcrumbs[this.breadcrumbs.length - 1];
        if (current) {
          current.timeOnPage = Date.now() - current.timestamp;
        }
      }
    } catch {
      // Silently fail
    }
  }

  /**
   * Update form context when interacting with form fields
   * Defensive: handles detached elements, null forms
   */
  private updateFormContext(element: HTMLElement | null | undefined): void {
    try {
      if (!element) {
        this.currentFormContext = null;
        return;
      }

      // Safe check for closest method
      if (typeof element.closest !== 'function') {
        this.currentFormContext = null;
        return;
      }

      const form = element.closest('form');
      if (!form) {
        this.currentFormContext = null;
        return;
      }

      const fieldNames: string[] = [];
      
      // Safe querySelectorAll
      try {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach((input) => {
          try {
            const el = input as HTMLInputElement;
            const name = el.name || el.id;
            if (name && typeof name === 'string' && !fieldNames.includes(name)) {
              fieldNames.push(name);
            }
          } catch {
            // Skip this input
          }
        });
      } catch {
        // Continue without field names
      }

      let hasValidationErrors = false;
      try {
        hasValidationErrors = form.querySelectorAll('[aria-invalid="true"], .error, .invalid').length > 0;
      } catch {
        // Default to false
      }

      this.currentFormContext = {
        formId: form.id || undefined,
        formName: form.name || undefined,
        fieldNames,
        hasValidationErrors,
      };
    } catch {
      this.currentFormContext = null;
    }
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
    try {
      const key = `${context.message}|${context.route || ''}|${context.component || ''}|${context.action || ''}`;
      return btoa(encodeURIComponent(key)).slice(0, 32);
    } catch {
      return `${Date.now()}`;
    }
  }

  /**
   * Redact PII from text
   */
  private redactPII(text: string): string {
    if (!text || typeof text !== 'string') return text || '';
    let redacted = text;
    for (const { pattern, replacement } of PII_PATTERNS) {
      try {
        redacted = redacted.replace(pattern, replacement);
      } catch {
        // Continue with other patterns
      }
    }
    return redacted;
  }

  /**
   * Redact PII from an object recursively
   */
  private redactObject(obj: any, depth = 0): any {
    try {
      if (depth > 10) return '[MAX_DEPTH]';
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string') return this.redactPII(obj);
      if (typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => this.redactObject(item, depth + 1));
      
      const redacted: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'creditcard', 'ssn', 'email'].includes(lowerKey)) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = this.redactObject(value, depth + 1);
        }
      }
      return redacted;
    } catch {
      return '[REDACTION_ERROR]';
    }
  }

  /**
   * Auto-detect severity based on error message and context
   */
  private detectSeverity(context: ErrorContext): 'low' | 'medium' | 'high' | 'critical' {
    if (context.severity) return context.severity;

    try {
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
    } catch {
      // Default to medium
    }

    return 'medium';
  }

  /**
   * Auto-detect error type based on context
   */
  private detectErrorType(context: ErrorContext): 'frontend' | 'backend' | 'api' | 'database' | 'auth' | 'payment' {
    if (context.errorType) return context.errorType;

    try {
      const searchText = `${context.message} ${context.route || ''} ${context.action || ''}`.toLowerCase();

      if (searchText.includes('payment') || searchText.includes('stripe') || searchText.includes('billing')) return 'payment';
      if (searchText.includes('auth') || searchText.includes('login') || searchText.includes('session') || searchText.includes('401') || searchText.includes('403')) return 'auth';
      if (searchText.includes('database') || searchText.includes('sql') || searchText.includes('query')) return 'database';
      if (searchText.includes('api') || context.route?.includes('/api/')) return 'api';
    } catch {
      // Default to frontend
    }
    
    return 'frontend';
  }

  /**
   * Check if we should throttle this error
   */
  private shouldThrottle(errorHash: string): boolean {
    try {
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
    } catch {
      // Don't throttle on error
    }

    return false;
  }

  /**
   * Check if error is a duplicate within dedup window
   */
  private isDuplicate(errorHash: string): boolean {
    try {
      const cached = this.errorCache.get(errorHash);
      if (!cached) return false;
      
      const timeSinceLast = Date.now() - cached.lastSeen.getTime();
      return timeSinceLast < CONFIG.DEDUP_WINDOW_MS;
    } catch {
      return false;
    }
  }

  /**
   * Get network information
   */
  private getNetworkInfo(): NetworkInfo {
    try {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (connection) {
        return {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
          type: connection.type,
        };
      }
    } catch {
      // Return empty
    }
    return {};
  }

  /**
   * Get user and school context from session/local storage
   */
  private getUserSchoolContext(): Record<string, any> {
    try {
      const activeRole = localStorage.getItem('activeRole');
      const selectedSchoolId = localStorage.getItem('selectedSchoolId');
      const userId = sessionStorage.getItem('userId');
      const userEmail = sessionStorage.getItem('userEmailHint');
      
      return {
        userId: userId ? parseInt(userId) : null,
        userEmailHint: userEmail || null,
        schoolId: selectedSchoolId ? parseInt(selectedSchoolId) : null,
        activeRole: activeRole || null,
      };
    } catch {
      return {};
    }
  }

  /**
   * Get comprehensive user context for error enrichment
   */
  private getUserContext(): Record<string, any> {
    try {
      const token = localStorage.getItem('supabase_token');
      const userSchoolContext = this.getUserSchoolContext();
      const networkInfo = this.getNetworkInfo();
      
      // Calculate time on current page
      const timeOnCurrentPage = Date.now() - this.pageEntryTime;
      
      return {
        // Session info
        hasSession: !!token,
        correlationId: this.correlationId,
        sessionStart: sessionStorage.getItem('sessionStart') || new Date().toISOString(),
        sessionErrorCount: this.sessionErrorCount,
        
        // User/School context
        ...userSchoolContext,
        
        // Page context
        pageLoadTime: performance?.timing?.loadEventEnd - performance?.timing?.navigationStart || null,
        timeOnCurrentPage,
        
        // Navigation breadcrumbs (last 5 pages)
        breadcrumbs: this.breadcrumbs.map(b => ({
          route: b.route,
          title: b.title,
          timeOnPage: b.timeOnPage,
          timestamp: new Date(b.timestamp).toISOString(),
        })),
        
        // Recent user actions (last 5)
        recentActions: this.userActions.slice(-5).map(a => ({
          type: a.type,
          target: a.target,
          secondsAgo: Math.round((Date.now() - a.timestamp) / 1000),
        })),
        
        // Form context (if in a form)
        formContext: this.currentFormContext ? {
          formId: this.currentFormContext.formId,
          formName: this.currentFormContext.formName,
          fieldCount: this.currentFormContext.fieldNames.length,
          hasValidationErrors: this.currentFormContext.hasValidationErrors,
        } : null,
        
        // Network quality
        network: Object.keys(networkInfo).length > 0 ? networkInfo : null,
        
        // Device/Browser info
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        userAgent: navigator.userAgent,
        language: navigator.language,
        online: navigator.onLine,
        referrer: document.referrer || null,
        
        // Performance hints
        memoryUsage: (performance as any).memory ? {
          usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
          totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024),
        } : null,
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
      // Increment session error count
      this.sessionErrorCount++;
      
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
        const cached = this.errorCache.get(errorHash);
        if (cached) {
          cached.count++;
          cached.lastSeen = new Date();
          console.log(`[ErrorTracker] Deduplicated error (count: ${cached.count})`);
          return cached.reported;
        }
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
      try {
        const now = Date.now();
        for (const [hash, entry] of this.errorCache.entries()) {
          // Remove entries older than 5 minutes
          if (now - entry.lastSeen.getTime() > 5 * 60 * 1000) {
            this.errorCache.delete(hash);
          }
        }
      } catch {
        // Silently fail
      }
    }, 60000); // Clean every minute
  }

  /**
   * Get current error stats (for debugging)
   */
  getStats(): { cacheSize: number; queueSize: number; errorsThisMinute: number; sessionErrorCount: number } {
    return {
      cacheSize: this.errorCache.size,
      queueSize: this.retryQueue.length,
      errorsThisMinute: this.totalErrorsThisMinute,
      sessionErrorCount: this.sessionErrorCount,
    };
  }

  /**
   * Get current breadcrumbs (for debugging)
   */
  getBreadcrumbs(): BreadcrumbEntry[] {
    return [...this.breadcrumbs];
  }

  /**
   * Get recent actions (for debugging)
   */
  getRecentActions(): UserAction[] {
    return [...this.userActions];
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
  try {
    const existingSessionStart = sessionStorage.getItem('sessionStart');
    if (!existingSessionStart) {
      sessionStorage.setItem('sessionStart', new Date().toISOString());
    }
  } catch {
    // Silently fail if sessionStorage is not available
  }
}

export default errorTracker;
