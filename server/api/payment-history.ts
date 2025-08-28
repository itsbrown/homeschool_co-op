import { Router } from 'express';
import { storage } from '../storage';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Get payment history for a specific user
router.get('/history', async (req, res) => {
  try {
    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // In development/test mode, use simple JWT decoding instead of Supabase verification
    let userEmail;
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userEmail = payload.email;
        if (!userEmail) {
          return res.status(401).json({
            success: false,
            error: 'Email not found in token'
          });
        }
      } catch (error) {
        console.log('❌ Token decode error:', error);
        console.log('Token parts:', token.split('.').length);
        console.log('Payload part:', token.split('.')[1]);
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
      }
    } else {
      // Production: Verify the Supabase token
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log('❌ Supabase auth error:', error);
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
      }
      userEmail = user.email;
    }

    console.log('✅ Payment history request for user:', userEmail);

    const payments = await storage.getPaymentsByParentEmail(userEmail!);
    
    // Transform payments to include formatted data
    const formattedPayments = payments.map((payment: any) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency || 'usd',
      status: payment.status,
      description: payment.description || `Payment for ${payment.className || 'program'}`,
      date: payment.createdAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      enrollmentIds: payment.enrollmentIds || [],
      metadata: payment.metadata,
      childName: payment.childName || '',
      programName: payment.className || '',
      paymentMethod: payment.paymentMethod || 'card'
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
      payments: payments.map((payment: any) => ({
        id: payment.id,
        parentEmail: payment.parentEmail,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description || 'Payment',
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        enrollmentIds: payment.enrollmentIds || []
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
        description: (payment as any).description || 'Payment',
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        enrollmentIds: (payment as any).enrollmentIds || [],
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

// Create manual payment (school admin only)
router.post('/manual', async (req, res) => {
  try {
    console.log('💰 Manual payment creation request received');
    
    // Extract and verify user role from token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    let userEmail;

    // Decode token to get user email
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userEmail = payload.email;
        if (!userEmail) {
          return res.status(401).json({
            success: false,
            error: 'Email not found in token'
          });
        }
      } catch (error) {
        console.log('❌ Token decode error:', error);
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
      }
    } else {
      // Production: Verify the Supabase token
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log('❌ Supabase auth error:', error);
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
      }
      userEmail = user.email;
    }

    // Verify user has school admin role
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !['schoolAdmin', 'superAdmin', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. School administrator access required.'
      });
    }

    console.log('✅ Manual payment authorized for school admin:', userEmail);

    const {
      parentEmail,
      childName,
      className,
      amount,
      currency = 'usd',
      paymentMethod = 'manual',
      description,
      notes,
      paymentDate
    } = req.body;

    // Validate required fields
    if (!parentEmail || !childName || !className || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: parentEmail, childName, className, amount'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Verify parent exists
    try {
      const parentUser = await storage.getUserByEmail(parentEmail);
      if (!parentUser) {
        return res.status(400).json({
          success: false,
          error: 'Parent email not found in system'
        });
      }
    } catch (error) {
      console.log('❌ Error verifying parent:', error);
      return res.status(400).json({
        success: false,
        error: 'Unable to verify parent email'
      });
    }

    // Create payment record
    const paymentData = {
      stripePaymentIntentId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentEmail,
      childName,
      className,
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      status: 'completed' as const, // Manual payments are immediately completed
      metadata: {
        paymentMethod,
        createdBy: userEmail,
        createdByRole: 'schoolAdmin',
        isManualPayment: true,
        notes: notes || '',
        originalPaymentDate: paymentDate || new Date().toISOString()
      }
    };

    const payment = await storage.createPayment(paymentData);
    
    console.log('✅ Manual payment created:', payment.id);

    res.json({
      success: true,
      payment: {
        id: payment.id,
        parentEmail: payment.parentEmail,
        childName: payment.childName,
        className: payment.className,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: description || `Manual payment for ${childName} - ${className}`,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        paymentMethod,
        notes: notes || ''
      }
    });

  } catch (error) {
    console.error('❌ Error creating manual payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create manual payment'
    });
  }
});

export default router;