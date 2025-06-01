import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/components/SupabaseProvider';

export default function AuthCallback() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    console.log('🔄 AuthCallback - Processing authentication...');
    console.log('Auth state:', { isAuthenticated, isLoading, user });

    // If we're authenticated, redirect to appropriate dashboard
    if (isAuthenticated && user) {
      console.log('✅ Authentication successful, redirecting...');
      
      // Determine redirect based on user role
      const userRole = user.email === 'coreycreates@gmail.com' ? 'school_admin' : 'parent';
      
      if (userRole === 'school_admin') {
        setLocation('/schools');
      } else {
        setLocation('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  // Show loading while processing
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing authentication...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait while we log you in</p>
        </div>
      </div>
    );
  }

  return null;
}