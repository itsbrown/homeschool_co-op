import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient, User, Session } from "@supabase/supabase-js";
import { queryClient, setServiceUnavailable } from "@/lib/queryClient";
import {
  buildOAuthLoginRedirectUrl,
  clearAuthReturnTo,
  stripOAuthTokensFromUrl,
  syncAuthReturnToFromUrl,
} from "@/lib/auth-return-to";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const previewDemoMode = import.meta.env.VITE_PREVIEW_DEMO_MODE === "1";

if (!previewDemoMode && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables");
}

const demoSupabaseStub = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error("Preview demo does not use Supabase") }),
    signUp: async () => ({ data: { user: null, session: null }, error: new Error("Preview demo does not use Supabase") }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async () => ({ data: { provider: "google", url: null }, error: new Error("Preview demo does not use Supabase") }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  },
};

const supabaseClient = previewDemoMode
  ? (demoSupabaseStub as unknown as ReturnType<typeof createClient>)
  : createClient(supabaseUrl, supabaseAnonKey);

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
  signInDemoParent: () => Promise<void>;
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

  function demoUser(email: string, name: string): User {
    return {
      id: "preview-demo",
      email,
      app_metadata: {},
      user_metadata: { name },
      aud: "preview-demo",
      created_at: "",
    } as User;
  }

  useEffect(() => {
    if (previewDemoMode) {
      let cancelled = false;
      (async () => {
        try {
          const response = await fetch("/api/preview-demo/session", { credentials: "include" });
          const body = await response.json().catch(() => ({}));
          if (!cancelled && body?.signedIn && body.parent?.email) {
            setUser(demoUser(body.parent.email, body.parent.name ?? ""));
          }
        } catch (err) {
          console.error("Preview demo session check failed:", err);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

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

      // Store user context in sessionStorage for error tracking (privacy-safe hints)
      if (session?.user) {
        const email = session.user.email || '';
        sessionStorage.setItem('userEmailHint', email.split('@')[0].slice(0, 3) + '***');
        // We'll get the database userId from RoleContext, but store Supabase UUID for now
        sessionStorage.setItem('supabaseUserId', session.user.id);
      } else {
        sessionStorage.removeItem('userEmailHint');
        sessionStorage.removeItem('supabaseUserId');
        sessionStorage.removeItem('userId');
      }

      // Manage access token
      if (session?.access_token) {
        localStorage.setItem("supabase_token", session.access_token);
        console.log("✅ Stored Supabase access token");
      } else {
        localStorage.removeItem("supabase_token");
        console.log("🗑️ Removed Supabase access token");
      }

      // Clear cache on sign-out so the next user does not see stale queries.
      if (event === "SIGNED_OUT") {
        console.log("🚪 User signed out - auth state cleared");
        setSession(null);
        setUser(null);
        setIsLoading(false);
        queryClient.clear();
        console.log("🗑️ React Query cache cleared");
        return;
      }

      // Do not queryClient.clear() on SIGNED_IN — RoleContext is already mounted
      // and a full clear cancels /api/user/roles, trapping a valid session on /login.
      if (event === "SIGNED_IN") {
        localStorage.removeItem("asa_explicit_logout");
        setServiceUnavailable(false);
        try {
          sessionStorage.removeItem("registration_required_block_redirect");
        } catch {
          // ignore
        }
        void queryClient.invalidateQueries({ queryKey: ["/api/user/roles"] });
        console.log("🔄 Invalidated roles query for new session");
      }

      // Handle successful OAuth login or session refresh
      if (event === "SIGNED_IN" && session?.user) {
        console.log("✅ User signed in successfully, checking for redirect...");

        if (
          window.location.href.includes("#access_token=") ||
          window.location.search.includes("code=")
        ) {
          console.log("🔄 Cleaning up auth tokens from URL...");
          stripOAuthTokensFromUrl();
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
    // Eagerly sync session so /api/user/roles has a Bearer token before onAuthStateChange fires.
    if (data?.session) {
      setSession(data.session);
      setUser(data.session.user);
      localStorage.setItem("supabase_token", data.session.access_token);
      localStorage.removeItem("asa_explicit_logout");
      setServiceUnavailable(false);
      try {
        sessionStorage.removeItem("registration_required_block_redirect");
      } catch {
        // ignore
      }
    }
    return { data, error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signInDemoParent = async () => {
    if (!previewDemoMode) {
      throw new Error("Demo sign-in is only available on the preview.");
    }
    const response = await fetch("/api/preview-demo/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ parentKey: "avery" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.parent?.email) {
      throw new Error(typeof body.error === "string" ? body.error : "Demo sign-in failed.");
    }
    setUser(demoUser(body.parent.email, body.parent.name ?? "Avery Quinn"));
    setError(null);
    setIsLoading(false);
  };

  const signOut = async () => {
    if (previewDemoMode) {
      await fetch("/api/preview-demo/sign-out", { method: "POST", credentials: "include" });
      setUser(null);
      setSession(null);
      setIsLoading(false);
      return;
    }
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

      // Clear error tracking session storage
      sessionStorage.removeItem('userEmailHint');
      sessionStorage.removeItem('supabaseUserId');
      sessionStorage.removeItem('userId');
      clearAuthReturnTo();

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
    syncAuthReturnToFromUrl();
    const redirectTo = buildOAuthLoginRedirectUrl();

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
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
    signInDemoParent,
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