import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a SupabaseProvider');
  }
  return context;
};

interface SupabaseProviderProps {
  children: React.ReactNode;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Get initial session with error handling
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('Supabase session check:', { session, error });
      if (error) {
        console.error('Supabase session error:', error);
        setError(error);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch((err) => {
      console.error('Supabase connection error:', err);
      setError(err);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', { event, session });
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Handle successful OAuth login
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('✅ User signed in successfully, checking for redirect...');
        
        // Clear any auth tokens from URL and redirect
        const currentUrl = window.location.href;
        if (currentUrl.includes('#access_token=') || currentUrl.includes('?code=')) {
          console.log('🔄 Cleaning up auth tokens from URL and redirecting...');
          
          // Determine redirect based on user
          const userRole = session.user.email === 'coreycreates@gmail.com' ? 'school_admin' : 'parent';
          const redirectPath = userRole === 'school_admin' ? '/schools' : '/dashboard';
          
          // Use setTimeout to ensure the auth state is fully processed
          setTimeout(() => {
            window.location.replace(redirectPath);
          }, 100);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const signInWithGoogle = async () => {
    // Use production domain for OAuth redirects
    const redirectUrl = import.meta.env.PROD 
      ? `https://${import.meta.env.VITE_REPLIT_DOMAIN || 'e9b53de1-e746-4728-984c-69d24304d3d8-00-8l7syqdrxe0h.picard.replit.dev'}`
      : `${window.location.origin}`;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useSupabase = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

export { supabase };