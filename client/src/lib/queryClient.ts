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
  const token = localStorage.getItem('supabase_token');

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
    credentials: "include",
    ...options,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  // Use relative URL since frontend and backend run on same port
  const response = await fetch(`/api${url}`, config);

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

  await throwIfResNotOk(response);
  return response;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('supabase_token');
    
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
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