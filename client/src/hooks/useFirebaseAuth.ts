import { useState, useEffect } from 'react';
import { 
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  subscription?: string;
}

export function useFirebaseAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        
        // Sync with backend to get/create user profile
        try {
          const response = await fetch('/api/auth/firebase-sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await firebaseUser.getIdToken()}`
            },
            body: JSON.stringify({
              firebaseUid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            })
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
          } else {
            console.error('Failed to sync user with backend');
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'User',
              role: 'parent', // Default role
              subscription: 'free'
            });
          }
        } catch (error) {
          console.error('Error syncing user:', error);
          // Fallback to Firebase user data
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            role: 'parent',
            subscription: 'free'
          });
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const registerWithEmail = async (email: string, password: string, name: string, role: string = 'parent') => {
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: name
      });

      // The onAuthStateChanged listener will handle the rest
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return { success: true, user: result.user };
    } catch (error: any) {
      const errorMessage = error.message || 'Google login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'Logout failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    user,
    firebaseUser,
    isLoading,
    error,
    isAuthenticated: !!user,
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    logout
  };
}