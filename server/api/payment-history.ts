import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Get payment history for a specific user
router.get('/history', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const payments = await storage.getPaymentsByParentEmail(email);
    
    // Transform payments to include formatted data
    const formattedPayments = payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      enrollmentIds: payment.enrollmentIds,
      metadata: payment.metadata
    }));

    res.json({
      success: true,
      payments: formattedPayments
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment history'
    });
  }
});

// Get all payments (admin only)
router.get('/all', async (req, res) => {
  try {
    const payments = await storage.getAllPayments();
    
    res.json({
      success: true,
      payments: payments.map(payment => ({
        id: payment.id,
        parentEmail: payment.parentEmail,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        enrollmentIds: payment.enrollmentIds
      }))
    });
  } catch (error) {
    console.error('Error fetching all payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payments'
    });
  }
});

// Get payment details by ID
router.get('/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payments = await storage.getAllPayments();
    const payment = payments.find(p => p.id === parseInt(paymentId));
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        parentEmail: payment.parentEmail,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        enrollmentIds: payment.enrollmentIds,
        metadata: payment.metadata
      }
    });
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment details'
    });
  }
});

export default router;