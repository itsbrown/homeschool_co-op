/**
 * Stripe Configuration Module (Frontend)
 * 
 * Automatically selects appropriate Stripe public keys based on environment:
 * - Development: Uses VITE_TESTING_STRIPE_PUBLIC_KEY
 * - Production: Uses VITE_STRIPE_PUBLIC_KEY
 */

const isDevelopment = import.meta.env.MODE === 'development';

export const getStripePublishableKey = (): string => {
  if (isDevelopment) {
    const testKey = import.meta.env.VITE_TESTING_STRIPE_PUBLIC_KEY;
    if (testKey) {
      console.log('🧪 Using Stripe TEST public key for development');
      return testKey;
    }
    console.warn('⚠️ VITE_TESTING_STRIPE_PUBLIC_KEY not found, falling back to VITE_STRIPE_PUBLIC_KEY');
  }
  
  const liveKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  if (!liveKey) {
    throw new Error('VITE_STRIPE_PUBLIC_KEY environment variable is required');
  }
  
  console.log('💳 Using Stripe LIVE public key for production');
  return liveKey;
};

export const STRIPE_PUBLISHABLE_KEY = getStripePublishableKey();
