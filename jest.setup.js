// Global test setup
console.log = jest.fn(); // Suppress console.log in tests
console.error = jest.fn(); // Suppress console.error in tests

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock_secret';