import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { testDb } from '../helpers/testDatabase';
import { api } from '../helpers/apiHelpers';
import { resetAllMocks } from '../helpers/mockServices';

// Mock the Stripe client module
const mockStripeCustomersSearch = jest.fn();
const mockStripeSubscriptionsList = jest.fn();
const mockStripePaymentIntentsCreate = jest.fn();

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
      create: mockStripePaymentIntentsCreate,
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
 * Integration Tests for Stripe Payment Intent Sync Logic
 * 
 * Test Coverage:
 * - Database sync of stripeCustomerId during payment intent creation
 * - Automatic membership enrollment creation from existing Stripe subscriptions
 * - Preventing duplicate membership enrollments
 * - Non-blocking error handling for Stripe API errors
 */

describe('Integration: Stripe Payment Intent Sync Logic', () => {
  let testUser: any;
  let testSchool: any;
  let testChild: any;
  let testClass: any;

  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    resetAllMocks();
    await testDb.cleanup();

    // Reset Stripe mocks to default
    (mockStripeCustomersSearch as any).mockReset();
    (mockStripeCustomersSearch as any).mockResolvedValue({ data: [] });
    
    (mockStripeSubscriptionsList as any).mockReset();
    (mockStripeSubscriptionsList as any).mockResolvedValue({ data: [] });
    
    (mockStripePaymentIntentsCreate as any).mockReset();
    (mockStripePaymentIntentsCreate as any).mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret_abc',
      status: 'requires_payment_method',
      amount: 10000,
      currency: 'usd'
    });

    // Create test admin
    const testAdmin = await testDb.createTestUser({
      username: 'admin_sync_test',
      email: 'admin@synctest.com',
      role: 'schoolAdmin',
      name: 'Admin User'
    });

    // Create test school
    testSchool = await testDb.createTestSchool(testAdmin.id, {
      name: 'Sync Test School',
      registrationCode: 'SYNC123'
    });

    // Create test parent user
    testUser = await testDb.createTestUser({
      username: 'sync_test_parent',
      email: 'parent.sync@test.com',
      password: 'TestPassword123',
      name: 'Sync Test Parent',
      role: 'parent',
      schoolId: testSchool.id,
      stripeCustomerId: null // Explicitly null to test sync
    });

    // Create test child
    testChild = await testDb.createTestChild(testUser.id, {
      firstName: 'Test',
      lastName: 'Child',
      dateOfBirth: new Date('2015-01-01')
    });

    // Create test class
    testClass = await testDb.createTestClass(testSchool.id, {
      name: 'Test Class for Sync',
      description: 'Testing payment sync',
      price: 10000 // $100.00
    });
  });

  describe('Stripe Customer ID Sync During Payment Intent', () => {
    it('should sync stripeCustomerId when existing Stripe customer is found', async () => {
      const mockCustomerId = 'cus_sync_test_123';
      const mockSubscriptionId = 'sub_sync_test_456';
      
      // Verify user doesn't have Stripe customer ID before
      const userBefore = await testDb.getUserById(testUser.id);
      expect(userBefore.stripeCustomerId).toBeNull();
      
      // Mock Stripe to return existing customer and subscription
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name,
          metadata: {}
        }]
      });
      
      const mockSubscriptionStartDate = Math.floor(new Date().getTime() / 1000);
      const mockSubscriptionEndDate = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000);
      
      (mockStripeSubscriptionsList as any).mockResolvedValue({
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
      
      // Create payment intent with cart items
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email,
        paymentPlan: 'full',
        paymentFrequency: 'one_time'
      });

      expect(response.status).toBe(200);
      
      // CRITICAL ASSERTION: Verify database was updated with Stripe customer ID
      const userAfter = await testDb.getUserById(testUser.id);
      expect(userAfter.stripeCustomerId).toBe(mockCustomerId);
      
      // Verify Stripe API was called
      expect(mockStripeCustomersSearch).toHaveBeenCalledWith({
        query: `email:'${testUser.email}'`,
      });
      expect(mockStripeSubscriptionsList).toHaveBeenCalledWith({
        customer: mockCustomerId,
        status: 'active',
        limit: 1
      });
    });

    it('should not update stripeCustomerId if already set correctly', async () => {
      const mockCustomerId = 'cus_existing_123';
      
      // Set user's Stripe customer ID before test
      await testDb.updateUser(testUser.id, { stripeCustomerId: mockCustomerId });
      
      // Mock Stripe to return the same customer
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name,
          metadata: {}
        }]
      });
      
      (mockStripeSubscriptionsList as any).mockResolvedValue({ data: [] });

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      expect(response.status).toBe(200);
      
      // Verify customer ID remains unchanged
      const userAfter = await testDb.getUserById(testUser.id);
      expect(userAfter.stripeCustomerId).toBe(mockCustomerId);
    });

    it('should handle missing Stripe customer gracefully (no sync)', async () => {
      // Mock Stripe to return no customers
      (mockStripeCustomersSearch as any).mockResolvedValue({ data: [] });
      
      const userBefore = await testDb.getUserById(testUser.id);
      expect(userBefore.stripeCustomerId).toBeNull();

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      // Should still succeed (non-blocking)
      expect(response.status).toBe(200);
      
      // Customer ID should remain null
      const userAfter = await testDb.getUserById(testUser.id);
      expect(userAfter.stripeCustomerId).toBeNull();
    });
  });

  describe('Membership Enrollment Sync from Stripe Subscription', () => {
    it('should create membership enrollment when active subscription exists', async () => {
      const mockCustomerId = 'cus_membership_sync_123';
      const mockSubscriptionId = 'sub_membership_sync_456';
      const currentYear = new Date().getFullYear();
      
      // Verify no membership exists before
      const membershipsBefore = await testDb.getMembershipEnrollmentsByParentId(testUser.id);
      expect(membershipsBefore.length).toBe(0);
      
      // Mock Stripe customer and active subscription
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name
        }]
      });
      
      const mockSubscriptionStartDate = Math.floor(new Date().getTime() / 1000);
      const mockSubscriptionEndDate = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000);
      
      (mockStripeSubscriptionsList as any).mockResolvedValue({
        data: [{
          id: mockSubscriptionId,
          customer: mockCustomerId,
          status: 'active',
          items: {
            data: [{
              price: {
                id: 'price_membership_annual',
                unit_amount: 17500
              }
            }]
          },
          current_period_start: mockSubscriptionStartDate,
          current_period_end: mockSubscriptionEndDate,
          metadata: {}
        }]
      });

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      expect(response.status).toBe(200);
      
      // CRITICAL ASSERTION: Verify membership enrollment was created
      const membershipsAfter = await testDb.getMembershipEnrollmentsByParentId(testUser.id);
      expect(membershipsAfter.length).toBe(1);
      
      const membership = membershipsAfter[0];
      expect(membership.membershipYear).toBe(currentYear);
      expect(membership.status).toBe('enrolled');
      expect(membership.stripeSubscriptionId).toBe(mockSubscriptionId);
      expect(membership.stripeCustomerId).toBe(mockCustomerId);
      expect(membership.amount).toBe(17500);
      expect(membership.amountPaid).toBe(17500);
      expect(membership.remainingBalance).toBe(0);
      expect(membership.membershipTier).toBe('basic');
    });

    it('should NOT create duplicate membership if one already exists for current year', async () => {
      const mockCustomerId = 'cus_no_duplicate_123';
      const mockSubscriptionId = 'sub_no_duplicate_456';
      const currentYear = new Date().getFullYear();
      
      // Create existing membership enrollment
      await testDb.createTestMembershipEnrollment(testUser.id, testSchool.id, {
        membershipYear: currentYear,
        status: 'enrolled',
        amount: 17500,
        stripeSubscriptionId: mockSubscriptionId
      });
      
      const membershipsBefore = await testDb.getMembershipEnrollmentsByParentId(testUser.id);
      expect(membershipsBefore.length).toBe(1);
      
      // Mock Stripe with active subscription
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name
        }]
      });
      
      const mockSubscriptionStartDate = Math.floor(new Date().getTime() / 1000);
      const mockSubscriptionEndDate = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000);
      
      (mockStripeSubscriptionsList as any).mockResolvedValue({
        data: [{
          id: mockSubscriptionId,
          customer: mockCustomerId,
          status: 'active',
          items: {
            data: [{
              price: {
                id: 'price_membership_annual',
                unit_amount: 17500
              }
            }]
          },
          current_period_start: mockSubscriptionStartDate,
          current_period_end: mockSubscriptionEndDate,
          metadata: {}
        }]
      });

      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      expect(response.status).toBe(200);
      
      // CRITICAL ASSERTION: Verify NO duplicate was created
      const membershipsAfter = await testDb.getMembershipEnrollmentsByParentId(testUser.id);
      expect(membershipsAfter.length).toBe(1); // Still only 1
    });

    it('should handle subscription without creating membership if user has no schoolId', async () => {
      const mockCustomerId = 'cus_no_school_123';
      const mockSubscriptionId = 'sub_no_school_456';
      
      // Create user without schoolId
      const userWithoutSchool = await testDb.createTestUser({
        email: 'noschool@test.com',
        role: 'parent',
        schoolId: null,
        stripeCustomerId: null
      });
      
      // Create child for this user
      const childWithoutSchool = await testDb.createTestChild(userWithoutSchool.id, {
        firstName: 'No',
        lastName: 'School',
        dateOfBirth: new Date('2015-01-01')
      });
      
      // Mock Stripe with subscription
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: userWithoutSchool.email,
          name: userWithoutSchool.name
        }]
      });
      
      const mockSubscriptionStartDate = Math.floor(new Date().getTime() / 1000);
      const mockSubscriptionEndDate = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000);
      
      (mockStripeSubscriptionsList as any).mockResolvedValue({
        data: [{
          id: mockSubscriptionId,
          customer: mockCustomerId,
          status: 'active',
          items: {
            data: [{
              price: {
                id: 'price_membership_annual',
                unit_amount: 17500
              }
            }]
          },
          current_period_start: mockSubscriptionStartDate,
          current_period_end: mockSubscriptionEndDate,
          metadata: {}
        }]
      });

      await api.loginAsUser(userWithoutSchool.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: childWithoutSchool.id,
          childName: `${childWithoutSchool.firstName} ${childWithoutSchool.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: userWithoutSchool.email
      });

      expect(response.status).toBe(200);
      
      // Customer ID should be synced
      const userAfter = await testDb.getUserById(userWithoutSchool.id);
      expect(userAfter.stripeCustomerId).toBe(mockCustomerId);
      
      // But NO membership should be created (no schoolId)
      const memberships = await testDb.getMembershipEnrollmentsByParentId(userWithoutSchool.id);
      expect(memberships.length).toBe(0);
    });
  });

  describe('Error Handling and Non-Blocking Behavior', () => {
    it('should handle Stripe API errors gracefully without failing payment', async () => {
      // Mock Stripe to throw error
      (mockStripeCustomersSearch as any).mockRejectedValue(new Error('Stripe API unavailable'));
      
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      // Should still succeed (non-blocking error handling)
      expect(response.status).toBe(200);
      expect(response.body.clientSecret).toBeDefined();
      
      // Database should remain unchanged
      const userAfter = await testDb.getUserById(testUser.id);
      expect(userAfter.stripeCustomerId).toBeNull();
      
      const memberships = await testDb.getMembershipEnrollmentsByParentId(testUser.id);
      expect(memberships.length).toBe(0);
    });

    it('should handle subscription list errors gracefully', async () => {
      const mockCustomerId = 'cus_sub_error_123';
      
      // Mock customer search succeeds but subscription list fails
      (mockStripeCustomersSearch as any).mockResolvedValue({
        data: [{
          id: mockCustomerId,
          email: testUser.email,
          name: testUser.name
        }]
      });
      
      (mockStripeSubscriptionsList as any).mockRejectedValue(new Error('Subscription list error'));
      
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      // Should still succeed
      expect(response.status).toBe(200);
      
      // Customer ID should NOT be synced if subscription check fails
      const userAfter = await testDb.getUserById(testUser.id);
      expect(userAfter.stripeCustomerId).toBeNull();
    });
  });

  describe('Payment Intent Creation Integration', () => {
    it('should create payment intent even when no Stripe sync occurs', async () => {
      // No Stripe customer or subscription
      (mockStripeCustomersSearch as any).mockResolvedValue({ data: [] });
      
      await api.loginAsUser(testUser.email);
      
      const response = await api.post('/api/stripe/create-payment-intent', {
        items: [{
          childId: testChild.id,
          childName: `${testChild.firstName} ${testChild.lastName}`,
          classId: testClass.id,
          className: testClass.name,
          classType: 'school',
          price: 10000
        }],
        subtotal: 10000,
        total: 10000,
        discounts: [],
        parentEmail: testUser.email
      });

      expect(response.status).toBe(200);
      expect(response.body.clientSecret).toBeDefined();
      expect(response.body.clientSecret).toContain('pi_test_123_secret');
      
      // Verify payment intent was created via Stripe
      expect(mockStripePaymentIntentsCreate).toHaveBeenCalled();
    });
  });
});
