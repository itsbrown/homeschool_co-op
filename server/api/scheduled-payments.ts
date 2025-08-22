import { Router } from 'express';
import { storage } from '../storage';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Get upcoming scheduled payments for a user
router.get('/upcoming', async (req, res) => {
  try {
    // TODO: Fix authentication - temporarily hardcoded for testing
    const userEmail = 'tester@testing321.com';

    console.log('📅 Fetching scheduled payments for:', userEmail);
    
    // Get all scheduled payments for this parent
    const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    
    // Filter for pending payments and sort by due date
    const upcomingPayments = scheduledPayments
      .filter(payment => payment.status === 'pending')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    console.log(`📊 Found ${upcomingPayments.length} upcoming payments`);
    
    res.json({
      success: true,
      payments: upcomingPayments
    });
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch scheduled payments'
    });
  }
});

// Mark a scheduled payment as paid (for when someone pays early)
router.patch('/:id/paid', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    
    // Extract user email from Supabase token (same as payment-history)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Scheduled payments auth error:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }
    
    // Update the scheduled payment status
    const updatedPayment = await storage.updateScheduledPaymentStatus(paymentId, 'paid');
    
    if (!updatedPayment) {
      return res.status(404).json({
        success: false,
        error: 'Scheduled payment not found'
      });
    }
    
    res.json({
      success: true,
      payment: updatedPayment
    });
  } catch (error) {
    console.error('Error updating scheduled payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update scheduled payment'
    });
  }
});

export default router;