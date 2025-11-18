/**
 * Jest Setup File
 * Runs before all tests to configure the test environment
 */

// CRITICAL: Set NODE_ENV to 'test' FIRST before any other imports
// This must be done before any module that checks NODE_ENV is loaded
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/asa_test';

console.log('🧪 Jest Setup: NODE_ENV =', process.env.NODE_ENV);

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.console = {
  ...console,
  // Suppress console output during tests (comment out if debugging)
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock the email service module
jest.unstable_mockModule('../lib/email-service', () => ({
  sendWelcomeEmail: jest.fn(async () => true)
}));

// Mock environment setup
beforeAll(() => {
  // Any global setup needed before all tests
});

afterAll(() => {
  // Any global cleanup needed after all tests
});
