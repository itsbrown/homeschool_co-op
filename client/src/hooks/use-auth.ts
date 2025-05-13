import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  avatar?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export function useAuth() {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
    refetchOnWindowFocus: true,
  });

  const logout = async () => {
    await apiRequest("/api/auth/logout", {
      method: "POST",
    });
    // Force reload to clear client state
    window.location.href = "/login";
  };

  return {
    user,
    isLoading,
    isError,
    isAuthenticated: !!user,
    logout,
  };
}