/**
 * Stripe Configuration Module
 * 
 * Uses Replit's secure connection API for API key management.
 * This ensures the backend uses the same Stripe account as the frontend.
 * 
 * IMPORTANT: Uses 2025-11-17.clover API version to match user's Stripe account
 */

import Stripe from 'stripe';

let cachedSecretKey: string | null = null;
let cachedStripeClient: Stripe | null = null;

/**
 * Fetch Stripe credentials from Replit's connection API
 */
async function fetchStripeCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    // Fall back to environment variables if not in Replit environment
    const secretKey = process.env.NODE_ENV === 'development'
      ? (process.env.TESTING_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
      : process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('Stripe secret key not found');
    }
    
    return {
      publishableKey: process.env.VITE_STRIPE_PUBLIC_KEY || '',
      secretKey,
    };
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.publishable || !connectionSettings?.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

/**
 * Get the Stripe secret key (async)
 * Caches the result to avoid repeated API calls
 */
export async function getStripeSecretKey(): Promise<string> {
  if (cachedSecretKey) {
    return cachedSecretKey;
  }
  
  const { secretKey } = await fetchStripeCredentials();
  cachedSecretKey = secretKey;
  return secretKey;
}

/**
 * Get a configured Stripe client (async)
 * Uses clover API version (2025-11-17.clover) to match user's Stripe account
 */
export async function getStripeClient(): Promise<Stripe> {
  if (cachedStripeClient) {
    return cachedStripeClient;
  }
  
  const secretKey = await getStripeSecretKey();
  cachedStripeClient = new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
    typescript: true,
  });
  
  return cachedStripeClient;
}

/**
 * Legacy exports for backward compatibility
 * NOTE: These will use the cached key after first async load
 * New code should use getStripeClient() instead
 */
export let STRIPE_SECRET_KEY = '';

// Initialize the key asynchronously on first import
// This maintains backward compatibility while using the new connector
(async () => {
  try {
    STRIPE_SECRET_KEY = await getStripeSecretKey();
  } catch (error) {
    console.error('Failed to initialize Stripe secret key:', error);
  }
})();

/**
 * Legacy synchronous Stripe instance
 * NOTE: This may not work correctly until async initialization completes
 * New code should use getStripeClient() instead
 */
export let stripe: Stripe | null = null;

// Initialize stripe client asynchronously
(async () => {
  try {
    stripe = await getStripeClient();
  } catch (error) {
    console.error('Failed to initialize Stripe client:', error);
  }
})();
