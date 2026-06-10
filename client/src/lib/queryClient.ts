import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "@/components/SupabaseProvider";
import { captureApiError, captureApi404 } from "@/lib/errorTracker";
import { toast } from "@/hooks/use-toast";
import {
  handleRegistrationRequired,
  isRegistrationRequiredBody,
} from "@/lib/registration-required";

// ---------------------------------------------------------------------------
// Task 266 — global "service unavailable" signal.
//
// When the API returns 503 with body { error: "SERVICE_UNAVAILABLE" } (emitted
// by `server/middleware/supabase-auth.ts` when the DB is unreachable and there
// is no app_metadata fallback), we surface a single non-blocking banner in the
// parent shell instead of letting every query spam toasts and refetch loops.
//
// The flag is module-local and exposed via a tiny pub/sub so React components
// can subscribe with `useSyncExternalStore` — no new context provider, no new
// dependencies. Cleared on any 2xx /api response (or via the banner Retry
// button).
// ---------------------------------------------------------------------------
let serviceUnavailable = false;
const serviceUnavailableListeners = new Set<() => void>();

function emitServiceUnavailableChange() {
  for (const l of serviceUnavailableListeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function getServiceUnavailable(): boolean {
  return serviceUnavailable;
}

export function subscribeServiceUnavailable(listener: () => void): () => void {
  serviceUnavailableListeners.add(listener);
  return () => { serviceUnavailableListeners.delete(listener); };
}

export function setServiceUnavailable(value: boolean) {
  if (serviceUnavailable === value) return;
  serviceUnavailable = value;
  emitServiceUnavailableChange();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/** Extract a human-readable message from apiRequest / throwIfResNotOk errors. */
export function parseApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/^\d+:\s*([\s\S]*)$/);
  const body = match?.[1]?.trim() ?? error.message;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    // body was plain text
  }
  return body || fallback;
}

/**
 * Safely parse JSON response, detecting HTML responses that indicate routing issues
 */
export async function safeJsonParse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  
  // Check if response is JSON
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    // Check if it's HTML (SPA fallback or error page)
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.error('❌ Received HTML instead of JSON - possible routing/auth issue');
      throw new Error('Server returned HTML instead of JSON. Please refresh the page and try again.');
    }
    // Try to parse anyway in case content-type header is missing
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid response format: ${text.slice(0, 100)}`);
    }
  }
  
  return response.json();
}

interface ApiRequestOptions {
  rawFormData?: boolean;
  token?: string;
  /**
   * Task 193 — opt-in list of HTTP status codes that should be returned to
   * the caller as a normal `Response` (so the body is readable) instead of
   * being thrown as `Error("<status>: <body>")` and auto-captured by
   * `captureApiError`. Use this when the endpoint encodes an actionable
   * outcome in a non-2xx body — e.g. `/api/scheduled-payments/pay` returns
   * 409 with `code: 'charge_amount_diverged'` so the caller can do friendly
   * self-recovery. Default: `[]` (preserve historical throw-on-non-2xx
   * behavior). 401/403/404 still take their dedicated paths.
   */
  passthroughStatuses?: number[];
}

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Single-flight guard for the expired-session handler.
let isHandlingExpiredSession = false;

interface HandleExpiredSessionOptions {
  /**
   * Suppress the in-app "Session expired — signing you out…" toast.
   *
   * Set to `true` for callers that fire during initial app bootstrap
   * (e.g. the role-loading query in `RoleContext`), where the dashboard
   * UI hasn't rendered yet and there's no surface to show a toast on
   * top of. Those callers rely on the login banner instead. Defaults to
   * `false`, so any other 401 path (mid-session API calls) shows the
   * toast and waits ~1.5s before redirecting.
   */
  suppressToast?: boolean;
}

/**
 * Centralized recovery for stale/expired Supabase sessions.
 *
 * Clears auth state, signs out (local scope), and redirects to
 * /login?session_expired=1&returnTo=<currentPath> so the login page can
 * show a friendly banner. Idempotent — only the first call redirects.
 *
 * For mid-session callers, also flashes a brief in-app toast before the
 * redirect so the user gets a heads-up instead of an abrupt page reload.
 * Pass `{ suppressToast: true }` from initial-bootstrap callers.
 */
export async function handleExpiredSession(
  options: HandleExpiredSessionOptions = {},
): Promise<void> {
  if (isHandlingExpiredSession) return;
  isHandlingExpiredSession = true;
  const { suppressToast = false } = options;

  try {
    // Skip the redirect if the user is already on a public/auth route.
    const currentPath = window.location.pathname;
    const publicPaths = [
      '/login',
      '/old-login',
      '/embedded-login',
      '/auth0-login',
      '/auth/login',
      '/auth/logout',
      '/auth/callback',
      '/auth-callback',
      '/logout',
      '/emergency-logout',
      '/forgot-password',
      '/reset-password',
      '/register',
    ];
    const isOnPublicPath =
      publicPaths.includes(currentPath) ||
      currentPath.startsWith('/accept-invitation') ||
      currentPath.startsWith('/accept-educator-invitation') ||
      currentPath.startsWith('/school-registration') ||
      currentPath.startsWith('/register/') ||
      currentPath.startsWith('/school/') ||
      currentPath.startsWith('/forms/') ||
      currentPath.startsWith('/qr/');

    console.log('🔒 Session expired — recovering');

    // Clear auth-related localStorage (known keys + any sb-*/supabase/token keys).
    localStorage.removeItem('supabase_token');
    localStorage.removeItem('selectedRole');
    localStorage.removeItem('userRole');
    localStorage.removeItem('activeRole');
    localStorage.removeItem('auth_redirect');
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('supabase') || key.startsWith('sb-') || key.startsWith('auth') || key.includes('token'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }

    try {
      queryClient.clear();
    } catch {
      // ignore
    }

    // Local-scope signOut: a global signOut needs a valid server-side token.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.warn('Supabase local signOut failed (non-fatal):', err);
    }

    try {
      sessionStorage.setItem(
        'session_expired_message',
        'Your session expired. Please sign in again.',
      );
    } catch {
      // ignore
    }

    if (!isOnPublicPath) {
      const returnTo = encodeURIComponent(currentPath + window.location.search);
      const redirectUrl = `/login?session_expired=1&returnTo=${returnTo}`;

      // Mid-session callers get a brief toast first; initial-bootstrap callers
      // (e.g. the role-loading query) opt out via { suppressToast: true } and
      // redirect immediately, letting the login banner take over.
      if (!suppressToast) {
        try {
          toast({
            title: 'Session expired',
            description: 'Signing you out…',
          });
        } catch (err) {
          console.warn('Failed to show session-expired toast (non-fatal):', err);
        }

        // Give the toast ~1.5s to be seen before we hard-redirect.
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 1500);
      } else {
        window.location.href = redirectUrl;
      }
    } else {
      isHandlingExpiredSession = false;
    }
  } catch (err) {
    console.error('Error in handleExpiredSession:', err);
    isHandlingExpiredSession = false;
  }
}

async function refreshToken(): Promise<string | null> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log('🔄 Attempting to refresh expired token...');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        console.log('❌ Token refresh failed:', error?.message);
        localStorage.removeItem('supabase_token');
        return null;
      }

      console.log('✅ Token refreshed successfully');
      localStorage.setItem('supabase_token', data.session.access_token);
      return data.session.access_token;
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      localStorage.removeItem('supabase_token');
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  options?: RequestInit & ApiRequestOptions,
  _retryCount: number = 0
): Promise<Response> {
  // Safety check for undefined URL
  if (!url || typeof url !== 'string') {
    console.error('❌ apiRequest called with invalid URL:', url);
    throw new Error(`Invalid URL provided to apiRequest: ${url}`);
  }

  let token = localStorage.getItem('supabase_token');
  const activeRole = localStorage.getItem('activeRole');

  // Check if body is FormData to handle file uploads properly
  const isFormData = body instanceof FormData;

  // Task 193 — extract our app-level options BEFORE spreading the rest into
  // RequestInit, so they don't end up as garbage fetch() init fields.
  const passthroughStatuses = options?.passthroughStatuses;
  const fetchOptions: RequestInit | undefined = options
    ? (() => {
        const { rawFormData: _rawFormData, token: _token, passthroughStatuses: _ps, ...rest } = options;
        return rest;
      })()
    : undefined;

  const config: RequestInit = {
    method,
    headers: {
      // Don't set Content-Type for FormData - let browser set it with boundary
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(activeRole && { 'X-Active-Role': activeRole }),
      ...fetchOptions?.headers,
    },
    credentials: "include",
    ...fetchOptions,
  };

  if (body) {
    // For FormData, use as-is; for other data, stringify as JSON
    config.body = isFormData ? body : JSON.stringify(body);
  }

  // Use relative URL since frontend and backend run on same port
  const finalUrl = url.startsWith('/api') ? url : `/api${url}`;
  const response = await fetch(finalUrl, config);

  // Task 266 — clear the global "service unavailable" flag on any 2xx /api
  // response. We deliberately do NOT *set* the flag here for non-GET requests
  // (mutations, payment posts, etc.) — only authenticated GETs going through
  // `getQueryFn` should turn the banner on. This keeps mutation/payment flows
  // out of scope per the task: a failed mutation won't flip the global signal,
  // but a successful mutation will clear a stale signal.
  if (response.ok && finalUrl.startsWith('/api')) {
    if (serviceUnavailable) setServiceUnavailable(false);
  } else if (
    response.status === 503 &&
    method === 'GET' &&
    finalUrl.startsWith('/api')
  ) {
    try {
      const clone = response.clone();
      const data = await clone.json();
      if (data?.error === 'SERVICE_UNAVAILABLE') {
        setServiceUnavailable(true);
      }
    } catch {
      // body wasn't JSON — ignore
    }
  }

  // Handle auth errors with automatic token refresh
  if (response.status === 401 && _retryCount === 0) {
    console.log('🔒 API 401: Token expired, attempting refresh...');

    const newToken = await refreshToken();

    if (newToken) {
      console.log('✅ Retrying request with refreshed token');
      return apiRequest(method, url, body, options, 1);
    } else {
      console.log('❌ Token refresh failed — recovering session');
      void handleExpiredSession();
      return response;
    }
  }

  // Retried request still returned 401 — refreshed token was also rejected.
  if (response.status === 401 && _retryCount > 0) {
    console.log('❌ API 401 after retry — recovering session');
    void handleExpiredSession();
    return response;
  }

  if (response.status === 403) {
    try {
      const responseClone = response.clone();
      const errorData = await responseClone.json();

      if (isRegistrationRequiredBody(errorData)) {
        await handleRegistrationRequired({
          message: errorData.message,
          email: errorData.email,
        });
        return response;
      }
    } catch {
      // If we can't parse the response, continue with normal 403 handling
    }

    console.log('🚫 API 403: Insufficient permissions');
    return response;
  }

  // For other error statuses, check if response is ok before trying to read body
  if (!response.ok) {
    // Task 193 — caller-managed status passthrough. The 4xx body is the
    // contract (e.g. /pay 409 with `code: 'charge_amount_diverged'`); the
    // caller will read it and surface a friendly UI. Skip both the auto
    // capture and the throw so the body remains readable.
    if (passthroughStatuses && passthroughStatuses.includes(response.status)) {
      return response;
    }

    // Clone the response so we can read it without consuming the original stream
    const responseClone = response.clone();
    let errorText = '';
    try {
      errorText = await responseClone.text();
      console.log(`❌ API ${response.status}: ${errorText}`);
    } catch (error) {
      console.log(`❌ API ${response.status}: Could not read response body`);
    }
    
    // Capture API error in error tracking (don't capture telemetry endpoint errors to avoid loops)
    if (!finalUrl.includes('/api/telemetry/')) {
      // Use specific 404 tracker for not found responses
      if (response.status === 404) {
        captureApi404(finalUrl, method, { 
          originalUrl: url,
          responseBody: errorText?.slice(0, 200),
        });
      } else {
        captureApiError(
          errorText || `API Error: ${response.statusText}`,
          response.status,
          finalUrl,
          method,
          { originalUrl: url }
        );
      }
    }
    
    // Now call throwIfResNotOk with the original response
    await throwIfResNotOk(response);
  }

  return response;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Handle array query keys properly by joining them into a URL
    // e.g., ['/api/staff', 5] becomes '/api/staff/5'
    let url: string;
    if (Array.isArray(queryKey) && queryKey.length > 1) {
      url = queryKey.join('/');
    } else {
      url = queryKey[0] as string;
    }
    const isApiUrl = typeof url === 'string' && url.startsWith('/api');

    // Task 266 — outage-aware suppression. While the global SERVICE_UNAVAILABLE
    // flag is set, short-circuit `/api/*` queries before they hit the network.
    // This wins over any per-query `refetchInterval`/`retry`/`refetchOnMount`
    // overrides that would otherwise keep hammering the backend during the
    // outage. The user can still manually clear the flag via the banner's
    // Retry button (which calls `setServiceUnavailable(false)` and
    // `queryClient.invalidateQueries()`), at which point queries run normally
    // again. Non-/api/* URLs and mutations are unaffected.
    if (isApiUrl && getServiceUnavailable()) {
      if (unauthorizedBehavior === 'returnNull') return null;
      throw new Error('503: SERVICE_UNAVAILABLE');
    }

    const doFetch = async () => {
      const token = localStorage.getItem('supabase_token');
      const activeRole = localStorage.getItem('activeRole');

      return fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(activeRole && { 'X-Active-Role': activeRole }),
        },
      });
    };

    let res = await doFetch();

    // On 401, try one silent token refresh; if still 401, trigger recovery.
    if (res.status === 401) {
      const newToken = await refreshToken();
      if (newToken) {
        res = await doFetch();
      }

      if (res.status === 401) {
        void handleExpiredSession();
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
      }
    }

    // Task 266 — detect/clear the SERVICE_UNAVAILABLE signal at the query
    // layer too (queries fetch directly via `fetch`, bypassing apiRequest).
    // Restricted to `/api/*` URLs to avoid false positives from any non-API
    // queries that happen to use the default queryFn.
    if (isApiUrl) {
      if (res.ok) {
        if (serviceUnavailable) setServiceUnavailable(false);
      } else if (res.status === 503) {
        try {
          const data = await res.clone().json();
          if (data?.error === 'SERVICE_UNAVAILABLE') {
            setServiceUnavailable(true);
          }
        } catch {
          // ignore non-JSON
        }
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Task 266 — refetch-storm suppression while SERVICE_UNAVAILABLE is active.
//
// The default options above already disable retries / window-focus refetch /
// interval refetch, but individual queries are free to override those defaults
// (e.g. `useQuery({ refetchInterval: 30_000, retry: 3 })`). When the global
// 503 signal flips on, we re-assert the safe defaults so any such per-query
// overrides are forced to pause for the duration of the outage. We also
// cancel in-flight queries so a chain of pending requests doesn't keep
// re-firing. When the signal clears (success or user-initiated Retry), we
// restore the original defaults so normal refetch behavior resumes. Mutations
// are intentionally untouched so payment flows continue to work as today.
const SAFE_QUERY_DEFAULTS = {
  retry: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
  refetchInterval: false as const,
  refetchOnMount: false as const,
};
const NORMAL_QUERY_DEFAULTS = {
  retry: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: true as const,
  refetchInterval: false as const,
  refetchOnMount: true as const,
};
subscribeServiceUnavailable(() => {
  if (getServiceUnavailable()) {
    queryClient.setDefaultOptions({
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        staleTime: Infinity,
        ...SAFE_QUERY_DEFAULTS,
      },
      mutations: { retry: false },
    });
    // Stop any currently-in-flight queries so they don't keep retrying.
    void queryClient.cancelQueries();
  } else {
    queryClient.setDefaultOptions({
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        staleTime: Infinity,
        ...NORMAL_QUERY_DEFAULTS,
      },
      mutations: { retry: false },
    });
  }
});