import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { sendPaymentReceipt } from '../lib/email-service';
import { CurrencyUtils, BillingCalculationService } from '../../shared/currency-utils';
import { MembershipService } from '../services/membership-service.js';
import Stripe from 'stripe';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
});

// Get payment history for a specific user (enriched with Stripe and enrollment data)
router.get('/history', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('✅ Payment history request (enriched) for user:', userEmail);

    // Step 1: Fetch all data sources in parallel
    const [dbPayments, enrollments, customerIds] = await Promise.all([
      storage.getPaymentsByParentEmail(userEmail),
      storage.getStripeLinkedEnrollmentsByParentEmail(userEmail),
      storage.getStripeCustomerIdsByParentEmail(userEmail)
    ]);
    
    console.log(`📊 Found: ${dbPayments.length} DB payments, ${enrollments.length} enrollments, ${customerIds.length} customer IDs`);
    
    // Step 2: Batch-fetch Stripe PaymentIntents for all customer IDs
    const stripePaymentIntents = new Map();
    if (customerIds.length > 0) {
      for (const customerId of customerIds) {
        try {
          const paymentIntents = await stripe.paymentIntents.list({
            customer: customerId,
            limit: 100 // Fetch last 100 payments per customer
          });
          
          for (const intent of paymentIntents.data) {
            stripePaymentIntents.set(intent.id, intent);
          }
        } catch (stripeError: any) {
          console.error(`⚠️  Failed to fetch Stripe payments for customer ${customerId}:`, stripeError.message);
          // Continue processing other customers even if one fails
        }
      }
    }
    console.log(`💳 Fetched ${stripePaymentIntents.size} Stripe PaymentIntents`);
    
    // Step 3: Create enrollment lookup map
    const enrollmentMap = new Map();
    for (const enrollment of enrollments) {
      enrollmentMap.set(enrollment.id, enrollment);
    }
    
    // Step 4: Merge and enrich payments
    const enrichedPayments = dbPayments.map((payment: any) => {
      // Get linked enrollments
      const linkedEnrollments = (payment.enrollmentIds || [])
        .map((id: number) => enrollmentMap.get(id))
        .filter(Boolean);
      
      // Extract payment plan from first enrollment
      const firstEnrollment = linkedEnrollments[0];
      const paymentPlan = firstEnrollment?.paymentPlan || payment.metadata?.paymentPlan || null;
      
      // Build enrollment details
      const enrollmentDetails = linkedEnrollments.map((e: any) => ({
        enrollmentId: e.id,
        childName: e.childName,
        className: e.className,
        status: e.status,
        paymentPlan: e.paymentPlan
      }));
      
      // Enrich with Stripe data if available
      const stripeIntent = payment.stripePaymentIntentId 
        ? stripePaymentIntents.get(payment.stripePaymentIntentId)
        : null;
      
      return {
        id: payment.id,
        amount: CurrencyUtils.toDisplay(payment.amount || 0),
        currency: payment.currency || 'usd',
        status: stripeIntent?.status || payment.status,
        description: payment.description || `Payment for ${payment.className || 'program'}`,
        date: payment.createdAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        enrollmentIds: payment.enrollmentIds || [],
        metadata: payment.metadata,
        childName: payment.childName || enrollmentDetails[0]?.childName || '',
        programName: payment.className || enrollmentDetails[0]?.className || '',
        paymentMethod: stripeIntent?.payment_method_types?.[0] || payment.paymentMethod || 'card',
        // Enriched fields
        paymentPlan: paymentPlan,
        enrollmentDetails: enrollmentDetails,
        // Stripe enrichment
        stripeStatus: stripeIntent?.status || null,
        stripeAmount: stripeIntent?.amount || null,
        stripeCreated: stripeIntent?.created ? new Date(stripeIntent.created * 1000) : null
      };
    });

    res.json({
      success: true,
      payments: enrichedPayments
    });
  } catch (error) {
    console.error('Error fetching enriched payment history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment history'
    });
  }
});

// Get all payments (admin only)
router.get('/all', supabaseAuth, async (req: any, res) => {
  try {
    // Verify admin role
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user || (user.role !== 'schoolAdmin' && user.role !== 'superAdmin')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const payments = await storage.getAllPayments();
    
    res.json({
      success: true,
      payments: payments.map((payment: any) => ({
        id: payment.id,
        parentEmail: payment.parentEmail,
        amount: CurrencyUtils.toDisplay(payment.amount || 0),
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
router.get('/:paymentId', supabaseAuth, async (req: any, res) => {
  try {
    const { paymentId } = req.params;
    
    // Verify admin role
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user || (user.role !== 'schoolAdmin' && user.role !== 'superAdmin')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
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
        amount: CurrencyUtils.toDisplay(payment.amount),
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
router.post('/manual', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💰 Manual payment creation request received');
    
    const userEmail = req.user.email;

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

    // Convert user input to storage format (cents)
    const amountInCents = CurrencyUtils.toStorage(amount);

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

    // Create payment record using unified currency system
    const paymentData = {
      stripePaymentIntentId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentEmail,
      childName,
      className,
      amount: amountInCents, // Already converted to cents
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

    // Update enrollment balances if matching enrollment found
    try {
      const allEnrollments = await storage.getAllEnrollments();
      
      // Find matching enrollments by parent email, child name, and class name
      const matchingEnrollments = allEnrollments.filter((enrollment: any) => {
        return enrollment.parentEmail === parentEmail &&
               enrollment.childName === childName &&
               enrollment.className === className;
      });

      console.log(`🔍 Found ${matchingEnrollments.length} matching enrollments for manual payment`);

      if (matchingEnrollments.length > 0) {
        // Apply payment to the most recent matching enrollment using unified billing service
        const enrollment = matchingEnrollments[0] as any;
        
        // Update enrollment using centralized billing logic
        const updatedEnrollment = BillingCalculationService.applyPaymentToEnrollment(enrollment, amountInCents);
        
        // Add payment tracking info
        updatedEnrollment.paymentIntentId = payment.stripePaymentIntentId;
        
        await storage.updateProgramEnrollment(updatedEnrollment.id, updatedEnrollment);
        
        console.log(`✅ Updated enrollment ${updatedEnrollment.id}: paid=${CurrencyUtils.format(updatedEnrollment.amountPaid)}, remaining=${CurrencyUtils.format(updatedEnrollment.remainingBalance)}, status=${updatedEnrollment.status}`);
      } else {
        console.log(`ℹ️ No matching enrollment found for manual payment - payment recorded as general payment`);
      }
    } catch (enrollmentError) {
      console.error('❌ Failed to update enrollment for manual payment:', enrollmentError);
      // Don't fail the payment creation if enrollment update fails
    }

    // Send email receipt
    try {
      const parentUser = await storage.getUserByEmail(parentEmail);
      const parentName = parentUser ? 
        parentUser.name || parentEmail.split('@')[0] : 
        parentEmail.split('@')[0];

      const formatCurrency = (amountInCents: number) => {
        return CurrencyUtils.format(amountInCents);
      };

      const formatDate = (date: string) => {
        return new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(date));
      };

      await sendPaymentReceipt({
        parentEmail,
        parentName,
        receiptNumber: payment.stripePaymentIntentId || `MANUAL-${payment.id}`,
        paymentDate: formatDate(paymentDate || payment.createdAt),
        paymentMethod: paymentMethod === 'manual' ? 'Manual Entry' : paymentMethod,
        amount: formatCurrency(payment.amount),
        childName,
        className,
        notes: notes || undefined
      });
      
      console.log('📧 Payment receipt email sent to:', parentEmail);
    } catch (emailError) {
      console.error('❌ Failed to send payment receipt email:', emailError);
      // Don't fail the payment creation if email fails
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        parentEmail: payment.parentEmail,
        childName: payment.childName,
        className: payment.className,
        amount: CurrencyUtils.toDisplay(payment.amount),
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

// Refund a payment (school admin only)
router.post('/refund/:paymentId', supabaseAuth, async (req: any, res) => {
  try {
    console.log('🔄 Processing refund request for payment:', req.params.paymentId);

    const userEmail = req.user.email;

    // Verify user has school admin role
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !['schoolAdmin', 'superAdmin', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. School administrator access required.'
      });
    }

    const { reason, refundAmount } = req.body;
    const paymentId = parseInt(req.params.paymentId);

    // Get the original payment
    const allPayments = await storage.getAllPayments();
    const originalPayment = allPayments.find((p: any) => p.id === paymentId);

    if (!originalPayment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Validate refund amount
    const maxRefundAmount = originalPayment.amount;
    const refundAmountCents = refundAmount ? Math.round(refundAmount * 100) : maxRefundAmount;

    if (refundAmountCents > maxRefundAmount || refundAmountCents <= 0) {
      return res.status(400).json({
        success: false,
        error: `Refund amount must be between $0.01 and $${(maxRefundAmount / 100).toFixed(2)}`
      });
    }

    // Check if this is a Stripe payment or manual payment
    const isStripePayment = originalPayment.stripePaymentIntentId && 
                           !originalPayment.stripePaymentIntentId.startsWith('manual_') &&
                           !originalPayment.stripePaymentIntentId.startsWith('enrollment_');

    let stripeRefund = null;

    // Process actual Stripe refund if this was a Stripe payment
    if (isStripePayment) {
      try {
        console.log(`💳 Processing Stripe refund for payment intent: ${originalPayment.stripePaymentIntentId}`);
        
        stripeRefund = await stripe.refunds.create({
          payment_intent: originalPayment.stripePaymentIntentId,
          amount: refundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            refundedBy: userEmail,
            refundedByRole: 'schoolAdmin',
            originalPaymentId: paymentId.toString(),
            refundReason: reason || 'Administrative refund'
          }
        });

        console.log(`✅ Stripe refund processed successfully: ${stripeRefund.id}`);
      } catch (stripeError: any) {
        console.error('❌ Stripe refund error:', stripeError);
        
        // Handle specific Stripe errors
        if (stripeError.type === 'StripeCardError') {
          return res.status(400).json({
            success: false,
            error: 'Card error: ' + stripeError.message
          });
        } else if (stripeError.code === 'charge_already_refunded') {
          return res.status(400).json({
            success: false,
            error: 'This payment has already been refunded in Stripe'
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Failed to process Stripe refund: ' + stripeError.message
          });
        }
      }
    } else {
      console.log(`ℹ️ Manual payment detected - processing internal refund only (no Stripe API call)`);
    }

    // Create refund payment record in our system
    const refundPaymentData = {
      stripePaymentIntentId: stripeRefund ? stripeRefund.id : `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentEmail: originalPayment.parentEmail,
      childName: originalPayment.childName,
      className: originalPayment.className,
      amount: -refundAmountCents, // Negative amount for refund
      currency: originalPayment.currency || 'usd',
      status: 'completed' as const,
      metadata: {
        paymentMethod: 'refund',
        originalPaymentId: paymentId,
        refundReason: reason || 'Administrative refund',
        createdBy: userEmail,
        createdByRole: 'schoolAdmin',
        isRefund: true,
        stripeRefundId: stripeRefund?.id || null,
        stripeRefundStatus: stripeRefund?.status || null,
        refundType: isStripePayment ? 'stripe' : 'manual'
      }
    };

    const refundPayment = await storage.createPayment(refundPaymentData);
    console.log('✅ Refund payment record created:', refundPayment.id);

    // Update enrollment balances for ALL affected enrollments
    try {
      const allEnrollments = await storage.getAllEnrollments();
      
      // Find matching enrollments using enrollmentIds if available, otherwise match by details
      let matchingEnrollments = [];
      
      if (originalPayment.enrollmentIds && Array.isArray(originalPayment.enrollmentIds)) {
        // Use enrollmentIds from payment record for accurate matching
        matchingEnrollments = allEnrollments.filter((enrollment: any) => 
          originalPayment.enrollmentIds.includes(enrollment.id)
        );
        console.log(`🔍 Found ${matchingEnrollments.length} enrollments via enrollmentIds for refund`);
      } else {
        // Fallback: match by parent email, child name, and class name
        matchingEnrollments = allEnrollments.filter((enrollment: any) => {
          return enrollment.parentEmail === originalPayment.parentEmail &&
                 enrollment.childName === originalPayment.childName &&
                 enrollment.className === originalPayment.className;
        });
        console.log(`🔍 Found ${matchingEnrollments.length} enrollments via detail matching for refund`);
      }

      if (matchingEnrollments.length > 0) {
        // Distribute refund across all matching enrollments proportionally
        let remainingRefund = refundAmountCents;
        
        for (const enrollment of matchingEnrollments) {
          const currentAmountPaid = enrollment.totalPaid || 0;
          
          // For last enrollment, use all remaining refund to avoid rounding errors
          const refundForThisEnrollment = matchingEnrollments.indexOf(enrollment) === matchingEnrollments.length - 1
            ? remainingRefund
            : Math.min(remainingRefund, currentAmountPaid);
          
          if (refundForThisEnrollment <= 0) continue;
          
          const newAmountPaid = Math.max(0, currentAmountPaid - refundForThisEnrollment);
          const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmountPaid);
          
          // Determine enrollment status based on remaining balance
          let enrollmentStatus: "completed" | "cancelled" | "enrolled" | "withdrawn" | "waitlist";
          if (remainingBalance >= enrollment.totalCost) {
            enrollmentStatus = 'waitlist'; // Full refund, back to pending
          } else if (remainingBalance > 0) {
            enrollmentStatus = 'enrolled'; // Partial refund, still enrolled with balance
          } else {
            enrollmentStatus = 'enrolled'; // Still fully paid
          }
          
          await storage.updateProgramEnrollment(enrollment.id, {
            totalPaid: newAmountPaid,
            remainingBalance: remainingBalance,
            status: enrollmentStatus
          });
          console.log(`✅ Updated enrollment ${enrollment.id} for refund: refunded=${refundForThisEnrollment/100}, paid=${newAmountPaid/100}, remaining=${remainingBalance/100}`);
          
          remainingRefund -= refundForThisEnrollment;
        }
        
        console.log(`✅ Processed refund across ${matchingEnrollments.length} enrollments`);
      } else {
        console.log('⚠️ No matching enrollments found for refund - payment may be for non-enrollment item');
      }
    } catch (enrollmentError) {
      console.error('❌ Failed to update enrollments for refund:', enrollmentError);
      // Don't fail the refund if enrollment update fails
    }

    // Send refund notification email
    try {
      const parentUser = await storage.getUserByEmail(originalPayment.parentEmail);
      const parentName = parentUser ? 
        parentUser.name || originalPayment.parentEmail.split('@')[0] : 
        originalPayment.parentEmail.split('@')[0];

      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Math.abs(amount) / 100);
      };

      const formatDate = (date: string) => {
        return new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(date));
      };

      await sendPaymentReceipt({
        parentEmail: originalPayment.parentEmail,
        parentName,
        receiptNumber: refundPayment.stripePaymentIntentId || `REFUND-${refundPayment.id}`,
        paymentDate: formatDate(new Date().toISOString()),
        paymentMethod: 'Refund',
        amount: formatCurrency(refundAmountCents),
        childName: originalPayment.childName,
        className: originalPayment.className,
        notes: `Refund for payment ${originalPayment.id}. Reason: ${reason || 'Administrative refund'}`
      });
      
      console.log('📧 Refund receipt email sent to:', originalPayment.parentEmail);
    } catch (emailError) {
      console.error('❌ Failed to send refund receipt email:', emailError);
    }

    res.json({
      success: true,
      refund: {
        id: refundPayment.id,
        originalPaymentId: paymentId,
        amount: refundAmountCents / 100,
        reason: reason || 'Administrative refund',
        parentEmail: originalPayment.parentEmail,
        childName: originalPayment.childName,
        className: originalPayment.className,
        createdAt: refundPayment.createdAt,
        processedBy: userEmail,
        refundType: isStripePayment ? 'stripe' : 'manual',
        stripeRefundId: stripeRefund?.id || null,
        stripeRefundStatus: stripeRefund?.status || null
      },
      message: isStripePayment 
        ? '✅ Refund processed successfully through Stripe. The funds will be returned to the customer\'s payment method.'
        : '✅ Internal refund recorded. Note: This was a manual payment - no Stripe refund was processed.'
    });

  } catch (error) {
    console.error('❌ Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund'
    });
  }
});

// Create manual membership payment
router.post('/membership/manual', supabaseAuth, async (req: any, res) => {
  try {
    console.log('🏅 Manual membership payment creation request received');
    
    const userEmail = req.user.email;

    // Verify user has school admin role
    const user = await storage.getUserByEmail(userEmail);
    if (!user || !['schoolAdmin', 'superAdmin', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. School administrator access required.'
      });
    }

    console.log('✅ Manual membership payment authorized for school admin:', userEmail);

    const {
      membershipId,
      parentEmail,
      amount,
      currency = 'usd',
      paymentMethod = 'manual',
      description,
      notes,
      paymentDate
    } = req.body;

    // Validate required fields
    if (!membershipId || !parentEmail || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: membershipId, parentEmail, and amount are required'
      });
    }

    // Get membership enrollment to validate
    const membership = await storage.getMembershipEnrollmentById(membershipId);
    if (!membership) {
      return res.status(404).json({
        success: false,
        error: 'Membership enrollment not found'
      });
    }

    // Verify parent email matches membership
    const membershipParent = await storage.getUser(membership.parentUserId);
    if (!membershipParent || membershipParent.email !== parentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Parent email does not match membership enrollment'
      });
    }

    // Convert amount to cents
    const amountInCents = CurrencyUtils.toCents(amount);

    // Create payment record
    const paymentData = {
      parentEmail,
      childName: 'Membership Fee', // For membership, use this generic name
      className: `${membership.membershipYear} Annual Membership`,
      amount: amountInCents,
      currency: currency.toLowerCase(),
      status: 'completed',
      paymentMethod,
      stripePaymentIntentId: `MANUAL-MEMBERSHIP-${Date.now()}`,
      description: description || `Manual payment for ${membership.membershipYear} annual membership`,
      metadata: {
        membershipId: membership.id,
        paymentType: 'membership',
        membershipYear: membership.membershipYear,
        schoolId: membership.schoolId,
        notes: notes || ''
      }
    };

    const payment = await storage.createPayment(paymentData);
    console.log('✅ Manual membership payment created:', payment.id);

    // Update membership enrollment status and payment amounts
    try {
      const existingPayments = await storage.getPaymentsByParentEmail(parentEmail);
      const membershipPayments = existingPayments.filter(p => 
        p.metadata?.membershipId === membership.id &&
        ['completed', 'succeeded'].includes(p.status)
      );
      
      const totalPaid = CurrencyUtils.sum(membershipPayments.map(p => p.amount || 0));
      
      // Update membership status using the service
      await MembershipService.updateMembershipStatus(membership.id, totalPaid);
      
      console.log(`✅ Updated membership ${membership.id}: total paid=${CurrencyUtils.format(totalPaid)}`);
    } catch (membershipError) {
      console.error('❌ Error updating membership enrollment:', membershipError);
      // Don't fail the payment creation if membership update fails
    }

    // Send email receipt
    try {
      const parentUser = await storage.getUserByEmail(parentEmail);
      const parentName = parentUser ? 
        parentUser.name || parentEmail.split('@')[0] : 
        parentEmail.split('@')[0];

      const formatCurrency = (amountInCents: number) => {
        return CurrencyUtils.format(amountInCents);
      };

      const formatDate = (date: string) => {
        return new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(date));
      };

      await sendPaymentReceipt({
        parentEmail,
        parentName,
        receiptNumber: payment.stripePaymentIntentId || `MANUAL-MEMBERSHIP-${payment.id}`,
        paymentDate: formatDate(paymentDate || payment.createdAt),
        paymentMethod: paymentMethod === 'manual' ? 'Manual Entry' : paymentMethod,
        amount: formatCurrency(payment.amount),
        childName: 'Membership Fee',
        className: `${membership.membershipYear} Annual Membership`,
        notes: notes || `Annual membership payment for ${membership.membershipYear}`
      });
      
      console.log('📧 Membership payment receipt email sent to:', parentEmail);
    } catch (emailError) {
      console.error('❌ Failed to send membership payment receipt email:', emailError);
      // Don't fail the payment creation if email fails
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        membershipId: membership.id,
        parentEmail: payment.parentEmail,
        membershipYear: membership.membershipYear,
        amount: CurrencyUtils.toDisplay(payment.amount),
        currency: payment.currency,
        status: payment.status,
        description: description || `Manual membership payment for ${membership.membershipYear}`,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        paymentMethod,
        notes: notes || ''
      }
    });

  } catch (error) {
    console.error('❌ Error creating manual membership payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create manual membership payment'
    });
  }
});

export default router;