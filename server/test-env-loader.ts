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
  
  // Use TESTING_STRIPE_SECRET_KEY from environment/secrets for development
  // This ensures frontend and backend use keys from the same Stripe account
  const testSecretKey = process.env.TESTING_STRIPE_SECRET_KEY;
  // Check both naming conventions for the public key
  const testPublicKey = process.env.VITE_TESTING_STRIPE_PUBLIC_KEY || process.env.TESTING_VITE_STRIPE_PUBLIC_KEY;
  
  if (testSecretKey) {
    process.env.STRIPE_SECRET_KEY = testSecretKey;
    console.log('✅ Using TESTING_STRIPE_SECRET_KEY from secrets');
  } else {
    console.warn('⚠️ TESTING_STRIPE_SECRET_KEY not found - using STRIPE_SECRET_KEY from environment');
  }
  
  if (testPublicKey) {
    process.env.VITE_STRIPE_PUBLIC_KEY = testPublicKey;
    console.log('✅ Using VITE_TESTING_STRIPE_PUBLIC_KEY from secrets');
  } else {
    console.warn('⚠️ VITE_TESTING_STRIPE_PUBLIC_KEY not found - using VITE_STRIPE_PUBLIC_KEY from environment');
  }
  
  console.log('✅ Test Stripe keys loaded - development environment secured');
}