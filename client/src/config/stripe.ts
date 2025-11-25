/**
 * Stripe Configuration Module (Frontend)
 * 
 * Automatically selects appropriate Stripe public keys based on environment:
 * - Development: Uses VITE_TESTING_STRIPE_PUBLIC_KEY
 * - Production: Uses VITE_STRIPE_PUBLIC_KEY
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';

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

/**
 * Stripe API version - must match the backend version (2025-02-24.acacia)
 * This ensures frontend and backend communicate using the same API version
 */
export const STRIPE_API_VERSION = '2025-02-24.acacia';

/**
 * Pre-configured Stripe promise with the correct API version
 * Use this instead of calling loadStripe directly
 */
export const stripePromise: Promise<Stripe | null> = loadStripe(STRIPE_PUBLISHABLE_KEY, {
  apiVersion: STRIPE_API_VERSION as any,
});
