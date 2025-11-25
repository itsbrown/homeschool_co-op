/**
 * Stripe Configuration Module (Frontend)
 * 
 * Uses @stripe/stripe-js v8.x npm package for compatibility with
 * Stripe account API version 2025-11-17.clover.
 * 
 * Fetches publishable key from backend API which uses Replit's
 * secure Stripe connection for proper key management.
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';

let cachedPublishableKey: string | null = null;
let stripePromiseCache: Promise<Stripe | null> | null = null;

/**
 * Fetch the Stripe publishable key from the backend
 * The backend uses Replit's connection API for secure key management
 */
export async function fetchStripePublishableKey(): Promise<string> {
  if (cachedPublishableKey) {
    return cachedPublishableKey;
  }

  try {
    const response = await fetch('/api/stripe/config');
    if (!response.ok) {
      throw new Error(`Failed to fetch Stripe config: ${response.status}`);
    }
    const data = await response.json();
    cachedPublishableKey = data.publishableKey;
    return cachedPublishableKey!;
  } catch (error) {
    console.error('Failed to fetch Stripe publishable key:', error);
    throw error;
  }
}

/**
 * Get the Stripe promise - fetches key on first use
 */
export async function getStripePromise(): Promise<Stripe | null> {
  if (stripePromiseCache) {
    return stripePromiseCache;
  }

  const publishableKey = await fetchStripePublishableKey();
  stripePromiseCache = loadStripe(publishableKey);
  return stripePromiseCache;
}

/**
 * Legacy exports for backward compatibility
 * These will throw if accessed before fetchStripePublishableKey is called
 */
export const STRIPE_PUBLISHABLE_KEY = '';

// Create a lazy-loading stripe promise
export const stripePromise: Promise<Stripe | null> = (async () => {
  const key = await fetchStripePublishableKey();
  return loadStripe(key);
})();
