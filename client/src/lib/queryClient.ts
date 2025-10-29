import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

interface ApiRequestOptions {
  rawFormData?: boolean;
  token?: string;
}

export async function apiRequest(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  options?: RequestInit
): Promise<Response> {
  let token = localStorage.getItem('supabase_token');
  const activeRole = localStorage.getItem('activeRole');

  // Debug: Show which user this token belongs to
  if (token && url.includes('/school-admin/')) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('🔐 API Request to school-admin endpoint:', {
        url,
        tokenEmail: payload.email,
        activeRole,
        method
      });
    } catch (e) {
      console.log('🔐 Could not decode token for debugging');
    }
  }

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

  // Handle auth errors without throwing to prevent redirect loops
  if (response.status === 401) {
    console.log('🔒 API 401: Authentication required - clearing token');
    localStorage.removeItem('supabase_token');
    // Don't throw - let components handle this gracefully
    return response;
  }

  if (response.status === 403) {
    console.log('🚫 API 403: Insufficient permissions');
    // Don't throw - let components handle this gracefully
    return response;
  }

  // For other error statuses, check if response is ok before trying to read body
  if (!response.ok) {
    // Clone the response so we can read it without consuming the original stream
    const responseClone = response.clone();
    try {
      const text = await responseClone.text();
      console.log(`❌ API ${response.status}: ${text}`);
    } catch (error) {
      console.log(`❌ API ${response.status}: Could not read response body`);
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
    
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
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