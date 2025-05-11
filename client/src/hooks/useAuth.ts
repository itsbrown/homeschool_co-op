import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { User, AuthState } from "@/lib/types";
import { fetchCurrentUser, loginUser, logoutUser, registerUser } from "@/lib/api";
import { useLocation } from "wouter";

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (userData: {
    username: string;
    email: string;
    password: string;
    name: string;
    role: string;
    subscription: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  // Fetch current user
  const { data, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetchCurrentUser().catch(() => null),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (data) {
      setUser(data);
    }
  }, [data]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: { username: string; password: string }) => 
      loginUser(credentials),
    onSuccess: (userData) => {
      setUser(userData);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/dashboard");
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      setUser(null);
      queryClient.invalidateQueries();
      setLocation("/login");
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: registerUser,
    // Remove the automatic redirect - we'll handle it in the Register component
    // to enable auto-login after registration
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const register = async (userData: {
    username: string;
    email: string;
    password: string;
    name: string;
    role: string;
    subscription: string;
  }) => {
    await registerMutation.mutateAsync(userData);
  };

  const contextValue: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading: isLoading || loginMutation.isPending || logoutMutation.isPending,
    login,
    logout,
    register,
  };

  return React.createElement(AuthContext.Provider, 
    { value: contextValue }, 
    children
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
