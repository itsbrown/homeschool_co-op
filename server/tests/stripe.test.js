const { describe, it, expect, beforeEach, afterEach } = require('jest');
const fs = require('fs/promises');
const path = require('path');

// Mock the dataLayer to avoid WebSocket dependencies
const mockDataLayer = {
  refreshUserData: jest.fn().mockResolvedValue({})
};

// Mock the storage module
const mockStorage = {
  getEnrollmentById: jest.fn(),
  getClassById: jest.fn(),
  updateEnrollment: jest.fn(),
  createPayment: jest.fn()
};

// Mock imports
jest.mock('../services/dataLayer.js', () => ({
  dataLayer: mockDataLayer
}));

jest.mock('../storage', () => ({
  storage: mockStorage
}));

// Import the function under test after mocking
const { processBalancePayment } = require('../api/billing');

describe('processBalancePayment', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockStorage.getEnrollmentById.mockImplementation((id) => {
      const enrollments = {
        1: {
          id: 1,
          childName: 'Test Child 1',
          className: 'Test Class 1',
          totalPaid: 0,
          programId: 101,
          paymentStatus: 'pending'
        },
        2: {
          id: 2,
          childName: 'Test Child 2',
          className: 'Test Class 2',
          totalPaid: 0,
          programId: 102,
          paymentStatus: 'pending'
        }
      };
      return Promise.resolve(enrollments[id]);
    });
    
    mockStorage.getClassById.mockImplementation((id) => {
      const classes = {
        101: { price: 10000 }, // $100
        102: { price: 15000 }  // $150
      };
      return Promise.resolve(classes[id]);
    });
    
    mockStorage.updateEnrollment.mockResolvedValue(true);
    mockStorage.createPayment.mockResolvedValue(true);
  });

  it('distributes payment across enrollments correctly', async () => {
    const paymentIntent = {
      id: 'pi_test_payment_intent',
      amount: 10000, // $100 in cents
      currency: 'usd',
      metadata: {
        parentEmail: 'test@example.com',
        enrollmentIds: '[1,2]',
        paymentType: 'balance_payment',
      },
    };

    const userEmail = 'test@example.com';
    const enrollmentIds = [1, 2];
    const totalAmount = 100; // $100

    await processBalancePayment(paymentIntent, userEmail, enrollmentIds, totalAmount);

    // Verify enrollments were fetched
    expect(mockStorage.getEnrollmentById).toHaveBeenCalledWith(1);
    expect(mockStorage.getEnrollmentById).toHaveBeenCalledWith(2);

    // Verify classes were fetched for pricing
    expect(mockStorage.getClassById).toHaveBeenCalledWith(101);
    expect(mockStorage.getClassById).toHaveBeenCalledWith(102);

    // Verify enrollments were updated with correct amounts
    expect(mockStorage.updateEnrollment).toHaveBeenCalledWith(1, {
      totalPaid: 5000, // $50 in cents
      paymentStatus: 'partially_paid', // $50 paid out of $100 total
      status: 'enrolled'
    });

    expect(mockStorage.updateEnrollment).toHaveBeenCalledWith(2, {
      totalPaid: 5000, // $50 in cents  
      paymentStatus: 'partially_paid', // $50 paid out of $150 total
      status: 'enrolled'
    });

    // Verify payment record was created
    expect(mockStorage.createPayment).toHaveBeenCalledWith({
      stripePaymentIntentId: 'pi_test_payment_intent',
      parentEmail: 'test@example.com',
      childName: 'Test Child 1',
      className: 'Multiple Classes',
      amount: 10000,
      currency: 'usd',
      status: 'completed',
      metadata: {
        enrollmentIds: [1, 2],
        paymentDate: expect.any(String)
      }
    });

    // Verify real-time update was sent
    expect(mockDataLayer.refreshUserData).toHaveBeenCalledWith('test@example.com');
  });

  it('handles single enrollment payment correctly', async () => {
    const paymentIntent = {
      id: 'pi_test_single_payment',
      amount: 10000, // $100 in cents
      currency: 'usd'
    };

    const userEmail = 'test@example.com';
    const enrollmentIds = [1];
    const totalAmount = 100;

    await processBalancePayment(paymentIntent, userEmail, enrollmentIds, totalAmount);

    // Verify full payment amount goes to single enrollment
    expect(mockStorage.updateEnrollment).toHaveBeenCalledWith(1, {
      totalPaid: 10000, // Full $100 in cents
      paymentStatus: 'completed', // $100 paid equals $100 total cost
      status: 'enrolled'
    });

    // Verify payment record shows single class
    expect(mockStorage.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      childName: 'Test Child 1',
      className: 'Test Class 1' // Single class name, not "Multiple Classes"
    }));
  });

  it('handles enrollments with existing payments', async () => {
    // Override mock to return enrollment with existing payment
    mockStorage.getEnrollmentById.mockResolvedValueOnce({
      id: 1,
      childName: 'Test Child 1',
      className: 'Test Class 1',
      totalPaid: 3000, // Already paid $30
      programId: 101,
      paymentStatus: 'partially_paid'
    });

    const paymentIntent = {
      id: 'pi_test_existing_payment',
      amount: 5000, // $50 in cents
      currency: 'usd'
    };

    const userEmail = 'test@example.com';
    const enrollmentIds = [1];
    const totalAmount = 50;

    await processBalancePayment(paymentIntent, userEmail, enrollmentIds, totalAmount);

    // Verify payment is added to existing amount
    expect(mockStorage.updateEnrollment).toHaveBeenCalledWith(1, {
      totalPaid: 8000, // $30 existing + $50 new = $80
      paymentStatus: 'partially_paid', // $80 paid out of $100 total
      status: 'enrolled'
    });
  });

  it('skips already completed enrollments', async () => {
    // Override mock to return completed enrollment
    mockStorage.getEnrollmentById.mockResolvedValueOnce({
      id: 1,
      paymentStatus: 'completed'
    });

    const paymentIntent = {
      id: 'pi_test_completed',
      amount: 5000,
      currency: 'usd'
    };

    const userEmail = 'test@example.com';
    const enrollmentIds = [1];
    const totalAmount = 50;

    await processBalancePayment(paymentIntent, userEmail, enrollmentIds, totalAmount);

    // Verify no updates were made to completed enrollment
    expect(mockStorage.updateEnrollment).not.toHaveBeenCalled();
    expect(mockStorage.createPayment).not.toHaveBeenCalled();
  });

  it('handles missing enrollments gracefully', async () => {
    // Override mock to return null for missing enrollment
    mockStorage.getEnrollmentById.mockResolvedValueOnce(null);

    const paymentIntent = {
      id: 'pi_test_missing',
      amount: 5000,
      currency: 'usd'
    };

    const userEmail = 'test@example.com';
    const enrollmentIds = [999]; // Non-existent enrollment
    const totalAmount = 50;

    await processBalancePayment(paymentIntent, userEmail, enrollmentIds, totalAmount);

    // Verify no updates were made for missing enrollment
    expect(mockStorage.updateEnrollment).not.toHaveBeenCalled();
    expect(mockStorage.createPayment).not.toHaveBeenCalled();
  });
});