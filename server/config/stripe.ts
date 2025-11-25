/**
 * Stripe Configuration Module
 * 
 * Automatically selects appropriate Stripe keys based on environment:
 * - Development: Uses TESTING_STRIPE_SECRET_KEY
 * - Production: Uses STRIPE_SECRET_KEY
 * 
 * Exports a single Stripe client instance for the entire application.
 */

import Stripe from 'stripe';

const isDevelopment = process.env.NODE_ENV === 'development';

export const getStripeSecretKey = (): string => {
  if (isDevelopment) {
    const testKey = process.env.TESTING_STRIPE_SECRET_KEY;
    if (testKey) {
      console.log('🧪 Using Stripe TEST secret key for development');
      return testKey;
    }
    console.warn('⚠️ TESTING_STRIPE_SECRET_KEY not found, falling back to STRIPE_SECRET_KEY');
  }
  
  const liveKey = process.env.STRIPE_SECRET_KEY;
  if (!liveKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  
  console.log('💳 Using Stripe LIVE secret key for production');
  return liveKey;
};

export const STRIPE_SECRET_KEY = getStripeSecretKey();

/**
 * Single Stripe client instance for the entire application
 * Import this instead of creating new Stripe instances for better testability
 */
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20',
  typescript: true,
});
