/**
 * Stripe Configuration Module (Frontend)
 * 
 * Uses Stripe.js clover CDN (loaded in index.html) for compatibility with
 * Stripe account API version 2025-11-17.clover.
 * 
 * Environment-based key selection:
 * - Development: Uses VITE_TESTING_STRIPE_PUBLIC_KEY
 * - Production: Uses VITE_STRIPE_PUBLIC_KEY
 */

// Declare the global Stripe type from the CDN script
declare const Stripe: any;

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
 * Stripe promise using the clover CDN version
 * Compatible with Stripe account API version 2025-11-17.clover
 */
export const stripePromise = new Promise<any>((resolve) => {
  if (typeof Stripe !== 'undefined') {
    console.log('💳 Stripe.js clover loaded from CDN');
    resolve(Stripe(STRIPE_PUBLISHABLE_KEY));
  } else {
    window.addEventListener('load', () => {
      if (typeof Stripe !== 'undefined') {
        console.log('💳 Stripe.js clover loaded from CDN (on window load)');
        resolve(Stripe(STRIPE_PUBLISHABLE_KEY));
      } else {
        console.error('❌ Stripe.js clover failed to load from CDN');
        resolve(null);
      }
    });
  }
});
