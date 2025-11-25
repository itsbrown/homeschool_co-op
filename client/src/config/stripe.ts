/**
 * Stripe Configuration Module (Frontend)
 * 
 * Uses the latest Stripe.js npm package with clover API version support.
 * 
 * Environment-based key selection:
 * - Development: Uses VITE_TESTING_STRIPE_PUBLIC_KEY
 * - Production: Uses VITE_STRIPE_PUBLIC_KEY
 */

import { loadStripe } from '@stripe/stripe-js';

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
 * Stripe promise using the latest npm package
 * Compatible with clover API version (2025-11-17.clover)
 */
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
