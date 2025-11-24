// Conditionally load test environment configuration
// ALWAYS uses TEST keys in development/non-production environments
// Only uses LIVE keys in production

if (process.env.NODE_ENV === 'production') {
  console.log('🚀 Production mode - using live Stripe keys');
  const isLiveSecret = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
  const isLivePublic = process.env.VITE_STRIPE_PUBLIC_KEY?.startsWith('pk_live_');
  
  if (!isLiveSecret || !isLivePublic) {
    console.warn('⚠️  WARNING: Production environment but Stripe keys are not live keys!');
    console.warn('🔑 Stripe secret key:', isLiveSecret ? 'LIVE' : 'NOT LIVE');
    console.warn('🔑 Stripe public key:', isLivePublic ? 'LIVE' : 'NOT LIVE');
  }
} else {
  console.log('🔧 Development mode - loading test Stripe keys...');
  
  // ALWAYS override with test keys in development, regardless of what's configured
  // This prevents accidental use of live keys in development
  process.env.STRIPE_SECRET_KEY = "sk_test_51RkR2QRFKXbVXRE3U8c2AyDvLcOlqBQTYTeokh9J1O4hy9daHeW6B5Tzs0FyP2X2OC0Fnu9RVw9f8fQ8XMxFK6ne00nmfCHJxA";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_51RkR2QRFKXbVXRE3BwJnN0L9qeEDh2uDM3vsGr8JDb4LjGLPIUEQV5HeYFHnZlqGlVKrlFU8GRwM9dY0Sy0BXntL00uLiEGiXl";
  process.env.VITE_STRIPE_PUBLIC_KEY = "pk_test_51RkR2QRFKXbVXRE3BwJnN0L9qeEDh2uDM3vsGr8JDb4LjGLPIUEQV5HeYFHnZlqGlVKrlFU8GRwM9dY0Sy0BXntL00uLiEGiXl";
  
  // Note: STRIPE_WEBHOOK_SECRET is intentionally NOT set here
  // It must come from Replit environment variables and match the Stripe account that owns these keys
  // The webhook secret you set in Replit must be from a webhook created for the account: acct_1RkR2QRFKXbVXRE3
  
  console.log('✅ Test Stripe keys loaded - development environment secured');
}