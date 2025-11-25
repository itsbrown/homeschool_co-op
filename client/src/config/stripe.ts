/**
 * Stripe Configuration Module (Frontend)
 * 
 * Uses @stripe/stripe-js v8.x npm package for compatibility with
 * Stripe account API version 2025-11-17.clover.
 * 
 * Environment-based key selection:
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
      console.log('🔑 Key prefix:', testKey.substring(0, 20) + '...');
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
 * Stripe promise using @stripe/stripe-js v8.x npm package
 * Compatible with Stripe account API version 2025-11-17.clover
 */
export const stripePromise: Promise<Stripe | null> = loadStripe(STRIPE_PUBLISHABLE_KEY);
