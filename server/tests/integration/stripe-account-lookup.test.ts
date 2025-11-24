import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { testDb } from '../helpers/testDatabase';
import { api } from '../helpers/apiHelpers';
import { resetAllMocks } from '../helpers/mockServices';

// Mock the Stripe client module
const mockStripeCustomersSearch = jest.fn();
const mockStripeSubscriptionsList = jest.fn();

jest.mock('../../config/stripe', () => {
  const mockStripeClient = {
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      search: mockStripeCustomersSearch,
    },
    subscriptions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      list: mockStripeSubscriptionsList,
    },
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };

  return {
    stripe: mockStripeClient,
    STRIPE_SECRET_KEY: 'sk_test_mock',
    getStripeSecretKey: jest.fn(() => 'sk_test_mock'),
  };
});

/**
 * Integration Tests for Stripe Account Lookup Feature
 * 
 * Test Coverage:
 * - Test endpoint POST /api/stripe/test-account-lookup
 * - Authentication requirements
 * - Database user verification  
 * - Stripe customer search and subscription listing
 * - Membership enrollment sync from Stripe data
 * - Response structure and recommendations
 * - Error handling
 */

describe('Integration: Stripe Account Lookup', () => {
  let testUser: any;
  let testSchool: any;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    resetAllMocks();
    await testDb.cleanup();

    // Reset Stripe mocks to default (no customers/subscriptions found)
    mockStripeCustomersSearch.mockReset();
    mockStripeCustomersSearch.mockResolvedValue({ data: [] });
    
    mockStripeSubscriptionsList.mockReset();
    mockStripeSubscriptionsList.mockResolvedValue({ data: [] });

    // Create test admin for school creation
    const testAdmin = await testDb.createTestUser({
      username: 'admin_stripe_test',
      email: 'admin@stripetest.com',
      role: 'schoolAdmin',
      name: 'Admin User'
    });

    // Create test school
    testSchool = await testDb.createTestSchool(testAdmin.id, {
      name: 'Stripe Test School',
      registrationCode: 'STRIPE123'
    });

    // Create test parent user
    testUser = await testDb.createTestUser({
      username: 'stripe_test_parent',
      email: 'stripe.parent@test.com',
      password: 'TestPassword123',
      name: 'Stripe Test Parent',
      role: 'parent',
      schoolId: testSchool.id
    });
  });

  describe('Test Account Lookup Endpoint - No Stripe Account', () => {
    it('should return detailed diagnostics for existing user without Stripe account', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.result).toBeDefined();
      
      const result = response.body.result;
      
      // Should find database user
      expect(result.summary.hasDatabaseRecord).toBe(true);
      expect(result.databaseUser).toBeDefined();
      expect(result.databaseUser.id).toBe(testUser.id);
      expect(result.databaseUser.email).toBe(testUser.email);
      expect(result.databaseUser.schoolId).toBe(testSchool.id);
      
      // Should NOT find Stripe customer (mocked to return empty)
      expect(result.summary.hasStripeCustomer).toBe(false);
      expect(result.stripeCustomer).toBeNull();
      
      // Should NOT have active subscription
      expect(result.summary.hasActiveSubscription).toBe(false);
      expect(result.activeSubscriptions).toEqual([]);
      
      // Should NOT have active membership
      expect(result.summary.hasActiveMembership).toBe(false);
      
      // Verify Stripe API was called
      expect(mockStripeCustomersSearch).toHaveBeenCalledWith({
        query: `email:'${testUser.email}'`,
      });
    });

    it('should handle non-existent user gracefully', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: 'nonexistent@test.com'
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const result = response.body.result;
      
      expect(result.summary.hasDatabaseRecord).toBe(false);
      expect(result.databaseUser).toBeNull();
      expect(result.summary.hasStripeCustomer).toBe(false);
      
      // Should still attempt Stripe lookup
      expect(mockStripeCustomersSearch).toHaveBeenCalledWith({
        query: `email:'nonexistent@test.com'`,
      });
    });
  });

  describe('Test Account Lookup Endpoint - With Stripe Customer', () => {
    it('should detect existing Stripe customer and active subscription', async () => {
      const mockCustomerId = 'cus_stripe_test_123';
      const mockSubscriptionId = 'sub_stripe_test_456';
      
      // Verify user doesn't have Stripe customer ID before test
      const userBefore = await testDb.getUserById(testUser.id);
      expect(userBefore.stripeCustomerId).toBeNull();
      
      // Mock Stripe to return a customer
      mockStripeCustomersSearch.mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name,
          metadata: {}
        }]
      });
      
      // Mock Stripe to return an active subscription
      const mockSubscriptionStartDate = Math.floor(new Date().getTime() / 1000);
      const mockSubscriptionEndDate = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000);
      
      mockStripeSubscriptionsList.mockResolvedValue({
        data: [{
          id: mockSubscriptionId,
          customer: mockCustomerId,
          status: 'active',
          items: {
            data: [{
              price: {
                id: 'price_membership_annual',
                unit_amount: 17500,
                metadata: {
                  membershipTier: 'basic'
                }
              }
            }]
          },
          current_period_start: mockSubscriptionStartDate,
          current_period_end: mockSubscriptionEndDate,
          metadata: {
            schoolId: testSchool.id.toString(),
            parentUserId: testUser.id.toString(),
            membershipYear: new Date().getFullYear().toString()
          }
        }]
      });

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      const result = response.body.result;
      
      // Should detect Stripe customer
      expect(result.summary.hasStripeCustomer).toBe(true);
      expect(result.stripeCustomer).toBeDefined();
      expect(result.stripeCustomer.id).toBe(mockCustomerId);
      expect(result.stripeCustomer.email).toBe(testUser.email);
      
      // Should detect active subscription
      expect(result.summary.hasActiveSubscription).toBe(true);
      expect(result.activeSubscriptions.length).toBe(1);
      expect(result.activeSubscriptions[0].id).toBe(mockSubscriptionId);
      expect(result.activeSubscriptions[0].status).toBe('active');
      
      // Verify Stripe API was called correctly
      expect(mockStripeCustomersSearch).toHaveBeenCalledWith({
        query: `email:'${testUser.email}'`,
      });
      expect(mockStripeSubscriptionsList).toHaveBeenCalledWith({
        customer: mockCustomerId,
        status: 'active',
        limit: 100,
      });
      
      // Should provide appropriate recommendation
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.toLowerCase()).toMatch(/sync|subscription|active/);
    });

    it('should handle Stripe customer without active subscription', async () => {
      const mockCustomerId = 'cus_no_subscription';
      
      // Mock Stripe to return a customer but no subscriptions
      mockStripeCustomersSearch.mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name,
          metadata: {}
        }]
      });
      
      mockStripeSubscriptionsList.mockResolvedValue({
        data: [] // No active subscriptions
      });

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      const result = response.body.result;
      
      // Should detect customer but not subscription
      expect(result.summary.hasStripeCustomer).toBe(true);
      expect(result.summary.hasActiveSubscription).toBe(false);
      expect(result.activeSubscriptions).toEqual([]);
      
      // Should recommend checking Stripe status
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('Authentication and Validation', () => {
    it('should require authentication', async () => {
      api.clearAuth();
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(401);
    });

    it('should return 400 for missing email', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email is required');
    });

    it('should return 400 for invalid email format', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: 'not-an-email'
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Response Structure and Data', () => {
    it('should include timestamp in response', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      const result = response.body.result;
      
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should return membership enrollments for user', async () => {
      await api.loginAsUser(testUser.email);
      
      // Create a membership enrollment
      await testDb.createTestMembershipEnrollment(testUser.id, testSchool.id, {
        membershipYear: new Date().getFullYear(),
        status: 'enrolled',
        amount: 17500
      });

      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      const result = response.body.result;
      
      expect(result.membershipEnrollments).toBeDefined();
      expect(result.membershipEnrollments.length).toBeGreaterThan(0);
      expect(result.summary.hasActiveMembership).toBe(true);
      
      const membership = result.membershipEnrollments[0];
      expect(membership.membershipYear).toBe(new Date().getFullYear());
      expect(membership.status).toBe('enrolled');
      expect(membership.amount).toBe(17500);
    });

    it('should validate response structure', async () => {
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      const result = response.body.result;
      
      // Verify top-level structure
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('stripeCustomer');
      expect(result).toHaveProperty('activeSubscriptions');
      expect(result).toHaveProperty('databaseUser');
      expect(result).toHaveProperty('membershipEnrollments');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recommendation');
      
      // Verify summary structure
      expect(result.summary).toHaveProperty('hasStripeCustomer');
      expect(result.summary).toHaveProperty('hasActiveSubscription');
      expect(result.summary).toHaveProperty('hasDatabaseRecord');
      expect(result.summary).toHaveProperty('hasActiveMembership');
      
      // Verify databaseUser structure when user exists
      if (result.databaseUser) {
        expect(result.databaseUser).toHaveProperty('id');
        expect(result.databaseUser).toHaveProperty('email');
        expect(result.databaseUser).toHaveProperty('schoolId');
        expect(result.databaseUser).toHaveProperty('stripeCustomerId');
        expect(result.databaseUser).toHaveProperty('role');
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle Stripe API errors gracefully', async () => {
      // Mock Stripe to throw an error
      mockStripeCustomersSearch.mockRejectedValue(new Error('Stripe API error'));
      
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      // Should still return 200 with diagnostic info (non-blocking errors)
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const result = response.body.result;
      expect(result.summary.hasStripeCustomer).toBe(false);
      expect(result.stripeCustomer).toBeNull();
    });

    it('should handle multiple Stripe customers for same email', async () => {
      // Mock Stripe to return multiple customers (edge case)
      mockStripeCustomersSearch.mockResolvedValue({
        data: [
          { id: 'cus_1', email: testUser.email, name: testUser.name },
          { id: 'cus_2', email: testUser.email, name: testUser.name }
        ]
      });
      
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/test-account-lookup', {
        email: testUser.email
      });

      expect(response.status).toBe(200);
      const result = response.body.result;
      
      // Should detect customer (uses first one)
      expect(result.summary.hasStripeCustomer).toBe(true);
      expect(result.stripeCustomer).toBeDefined();
      expect(result.stripeCustomer.id).toBe('cus_1');
      
      // Should include recommendation about multiple customers
      expect(result.recommendation).toBeDefined();
    });
  });
});
