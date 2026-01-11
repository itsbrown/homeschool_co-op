import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "@/components/SupabaseProvider";
import { captureApiError, captureApi404 } from "@/lib/errorTracker";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
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
}

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

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
  options?: RequestInit,
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
  
  const config: RequestInit = {
    method,
    headers: {
      // Don't set Content-Type for FormData - let browser set it with boundary
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(activeRole && { 'X-Active-Role': activeRole }),
      ...options?.headers,
    },
    credentials: "include",
    ...options,
  };

  if (body) {
    // For FormData, use as-is; for other data, stringify as JSON
    config.body = isFormData ? body : JSON.stringify(body);
  }

  // Use relative URL since frontend and backend run on same port
  const finalUrl = url.startsWith('/api') ? url : `/api${url}`;
  const response = await fetch(finalUrl, config);

  // Handle auth errors with automatic token refresh
  if (response.status === 401 && _retryCount === 0) {
    console.log('🔒 API 401: Token expired, attempting refresh...');
    
    const newToken = await refreshToken();
    
    if (newToken) {
      console.log('✅ Retrying request with refreshed token');
      // Retry the request with the new token (mark as retry to prevent infinite loop)
      return apiRequest(method, url, body, options, 1);
    } else {
      console.log('❌ Token refresh failed - user needs to log in again');
      localStorage.removeItem('supabase_token');
      // Redirect to login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      return response;
    }
  }

  if (response.status === 403) {
    // Check if this is a REGISTRATION_REQUIRED error (unregistered user trying to use OAuth)
    try {
      const responseClone = response.clone();
      const errorData = await responseClone.json();
      
      if (errorData.error === 'REGISTRATION_REQUIRED') {
        console.log('🚫 REGISTRATION_REQUIRED: User needs to register with their school first');
        console.log('   Message:', errorData.message);
        
        // Clear auth state since this user shouldn't be logged in
        localStorage.removeItem('supabase_token');
        localStorage.removeItem('activeRole');
        
        // Sign out from Supabase to clear the OAuth session
        await supabase.auth.signOut();
        
        // Store the error message to display on login page
        sessionStorage.setItem('registration_required_message', errorData.message);
        sessionStorage.setItem('registration_required_email', errorData.email || '');
        
        // Redirect to login page with registration required message
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?error=registration_required';
        }
        return response;
      }
    } catch {
      // If we can't parse the response, continue with normal 403 handling
    }
    
    console.log('🚫 API 403: Insufficient permissions');
    // Don't throw - let components handle this gracefully
    return response;
  }

  // For other error statuses, check if response is ok before trying to read body
  if (!response.ok) {
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
    const token = localStorage.getItem('supabase_token');
    const activeRole = localStorage.getItem('activeRole');
    
    // Handle array query keys properly by joining them into a URL
    // e.g., ['/api/staff', 5] becomes '/api/staff/5'
    let url: string;
    if (Array.isArray(queryKey) && queryKey.length > 1) {
      url = queryKey.join('/');
    } else {
      url = queryKey[0] as string;
    }
    
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(activeRole && { 'X-Active-Role': activeRole }),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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