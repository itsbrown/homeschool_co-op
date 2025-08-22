import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Get upcoming scheduled payments for a user
router.get('/upcoming', async (req, res) => {
  try {
    // Get user email from Auth0 token or session
    const userEmail = (req as any).user?.email || (req as any).auth?.payload?.email || (req.session as any)?.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

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
    const userEmail = (req as any).user?.email || (req as any).auth?.payload?.email || (req.session as any)?.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
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