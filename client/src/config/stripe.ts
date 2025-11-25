/**
 * Stripe Configuration Module (Frontend)
 * 
 * Uses Stripe.js v3 loaded from CDN (in index.html) for compatibility with older API versions.
 * The v3 version is evergreen and works with accounts that haven't upgraded to "basil" API version.
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
 * Create Stripe instance using the global Stripe object from CDN (v3)
 * This version is compatible with older API versions (pre-basil)
 */
export const stripePromise = new Promise<any>((resolve) => {
  // Wait for DOM to be ready in case script hasn't loaded yet
  if (typeof Stripe !== 'undefined') {
    console.log('💳 Stripe.js v3 loaded from CDN');
    resolve(Stripe(STRIPE_PUBLISHABLE_KEY));
  } else {
    // Fallback: wait for script to load
    window.addEventListener('load', () => {
      if (typeof Stripe !== 'undefined') {
        console.log('💳 Stripe.js v3 loaded from CDN (on window load)');
        resolve(Stripe(STRIPE_PUBLISHABLE_KEY));
      } else {
        console.error('❌ Stripe.js failed to load from CDN');
        resolve(null);
      }
    });
  }
});
