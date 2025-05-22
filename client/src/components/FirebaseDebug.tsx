import { useEffect } from 'react';

export function FirebaseDebug() {
  useEffect(() => {
    console.log('=== Firebase Environment Variables Debug ===');
    console.log('VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY ? 'Present' : 'Missing');
    console.log('VITE_FIREBASE_PROJECT_ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
    console.log('VITE_FIREBASE_APP_ID:', import.meta.env.VITE_FIREBASE_APP_ID ? 'Present' : 'Missing');
    console.log('Current URL:', window.location.href);
    console.log('============================================');
  }, []);

  return null;
}