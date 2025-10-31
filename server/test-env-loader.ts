// Conditionally load test environment configuration
// Only applies test keys if LIVE keys are not configured
// Checks for live keys first, falls back to test keys

const hasLiveStripeKeys = 
  process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && 
  process.env.VITE_STRIPE_PUBLIC_KEY?.startsWith('pk_live_');

if (hasLiveStripeKeys || process.env.NODE_ENV === 'production') {
  console.log('🚀 Live mode detected - using configured Stripe keys');
  console.log('🔑 STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY?.substring(0, 7) + '...' + 
    (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? ' ✅ (LIVE MODE)' : 
     process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? ' ⚠️  (TEST MODE - WARNING!)' : 
     ' ❌ (INVALID KEY FORMAT)'));
  console.log('🔑 VITE_STRIPE_PUBLIC_KEY:', process.env.VITE_STRIPE_PUBLIC_KEY?.substring(0, 7) + '...' + 
    (process.env.VITE_STRIPE_PUBLIC_KEY?.startsWith('pk_live_') ? ' ✅ (LIVE MODE)' : 
     process.env.VITE_STRIPE_PUBLIC_KEY?.startsWith('pk_test_') ? ' ⚠️  (TEST MODE - WARNING!)' : 
     ' ❌ (INVALID KEY FORMAT)'));
} else {
  console.log('🔧 Development/test mode - loading test environment configuration...');
  
  // Override any existing environment variables with test values
  process.env.STRIPE_SECRET_KEY = "sk_test_51RkR2QRFKXbVXRE3U8c2AyDvLcOlqBQTYTeokh9J1O4hy9daHeW6B5Tzs0FyP2X2OC0Fnu9RVw9f8fQ8XMxFK6ne00nmfCHJxA";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_51RkR2QRFKXbVXRE3BwJnN0L9qeEDh2uDM3vsGr8JDb4LjGLPIUEQV5HeYFHnZlqGlVKrlFU8GRwM9dY0Sy0BXntL00uLiEGiXl";
  process.env.VITE_STRIPE_PUBLIC_KEY = "pk_test_51RkR2QRFKXbVXRE3BwJnN0L9qeEDh2uDM3vsGr8JDb4LjGLPIUEQV5HeYFHnZlqGlVKrlFU8GRwM9dY0Sy0BXntL00uLiEGiXl";
  
  // Note: STRIPE_WEBHOOK_SECRET is intentionally NOT set here
  // It must come from Replit environment variables and match the Stripe account that owns these keys
  // The webhook secret you set in Replit must be from a webhook created for the account: acct_1RkR2QRFKXbVXRE3
  
  console.log('✅ Test environment loaded:');
  console.log('🔑 STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY?.substring(0, 20) + '...');
  console.log('🔑 STRIPE_PUBLISHABLE_KEY:', process.env.STRIPE_PUBLISHABLE_KEY?.substring(0, 20) + '...');
  console.log('🧪 Test mode:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
}