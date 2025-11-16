import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient, User, Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey); // Renamed to supabaseClient to avoid conflict

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<any>;
  resetPassword: (email: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a SupabaseProvider");
  }
  return context;
};

interface SupabaseProviderProps {
  children: React.ReactNode;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Get initial session with error handling
    const initializeAuth = async () => {
      try {
        console.log("🔍 Initializing authentication...");
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        console.log("Supabase session check:", { session, error });

        if (error) {
          console.error("Supabase session error:", error);
          setError(error);
        }

        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Store initial token if available
        if (session?.access_token) {
          localStorage.setItem("supabase_token", session.access_token);
          console.log("✅ Stored initial Supabase access token");
        }

        // Debug session state
        console.log("🔍 Initial auth state:", {
          hasSession: !!session,
          userEmail: session?.user?.email,
          userId: session?.user?.id
        });
      } catch (err) {
        console.error("Supabase connection error:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, session) => {
      console.log("Auth state change:", { event, session });

      // Update state
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Debug user state
      console.log("🔍 SupabaseProvider user state updated:", {
        email: session?.user?.email,
        authenticated: !!session?.user,
        userId: session?.user?.id
      });

      // Manage access token
      if (session?.access_token) {
        localStorage.setItem("supabase_token", session.access_token);
        console.log("✅ Stored Supabase access token");
      } else {
        localStorage.removeItem("supabase_token");
        console.log("🗑️ Removed Supabase access token");
      }

      // Handle logout completion
      if (event === "SIGNED_OUT") {
        console.log("🚪 User signed out - auth state cleared");
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Handle successful OAuth login or session refresh
      if (event === "SIGNED_IN" && session?.user) {
        console.log("✅ User signed in successfully, checking for redirect...");

        // Clean up OAuth tokens from URL without redirect (let App.tsx handle routing)
        const currentUrl = window.location.href;
        if (currentUrl.includes("#access_token=") || currentUrl.includes("?code=")) {
          console.log("🔄 Cleaning up auth tokens from URL...");
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    try {
      console.log('🚪 Starting logout process...');

      // Set explicit logout flag for cart security
      localStorage.setItem('asa_explicit_logout', 'true');

      // Clear local storage first
      localStorage.removeItem('supabase_token');
      localStorage.removeItem('selectedRole');
      localStorage.removeItem('userRole');
      localStorage.removeItem('auth_redirect');

      // Clear all session-related items
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('supabase') || key.startsWith('auth') || key.includes('token'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // Force state update immediately
      setUser(null);
      setSession(null);
      setIsLoading(false);

      // Sign out from Supabase (do this after clearing state)
      const { error } = await supabaseClient.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('❌ Supabase logout error:', error);
      } else {
        console.log('✅ Successfully logged out from Supabase');
      }

      // Final cleanup
      console.log('✅ Logout process completed');

    } catch (error) {
      console.error('❌ Logout error:', error);
      // Even if there's an error, clear the local state
      setUser(null);
      setSession(null);
      setIsLoading(false);
      localStorage.clear(); // Full clear as fallback
    }
  };

  const signInWithGoogle = async () => {
    // Always use current domain for OAuth redirects
    const redirectUrl = window.location.origin;

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });
    return { data, error };
  };

  const resetPassword = async (email: string) => {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { data, error };
  };

  const value = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    error,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useSupabase = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return context;
};

// Alias for compatibility
export const useSupabaseAuth = useAuth;

export { supabaseClient as supabase }; // Exporting supabaseClient as supabase for backward compatibility