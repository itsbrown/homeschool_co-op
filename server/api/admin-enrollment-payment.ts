import express from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { recalculatePaymentSchedule, validateFrequencyChange, type PaymentFrequency } from '../lib/payment-calculator';
import { getStripeClient } from '../config/stripe';

const router = express.Router();

/**
 * PATCH /api/admin/enrollments/:id/payment-plan
 * Update payment frequency for an existing enrollment
 * Requires school admin role - auth middleware applied at router registration
 * 
 * Body: { 
 *   paymentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'one_time',
 *   adminComment: string (required - justification for change)
 * }
 */
router.patch('/:enrollmentId/payment-plan', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    const { paymentFrequency, adminComment } = req.body;

    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user is a school admin
    const user = await storage.getUserByEmail(userEmail);
    if (!user || user.role !== 'schoolAdmin') {
      return res.status(403).json({ error: 'Only school administrators can modify payment plans' });
    }

    // Validate input
    if (!paymentFrequency) {
      return res.status(400).json({ error: 'Payment frequency is required' });
    }

    const validFrequencies: PaymentFrequency[] = ['weekly', 'biweekly', 'monthly', 'one_time'];
    if (!validFrequencies.includes(paymentFrequency)) {
      return res.status(400).json({ error: 'Invalid payment frequency' });
    }

    if (!adminComment || adminComment.trim().length === 0) {
      return res.status(400).json({ error: 'Admin comment is required to justify payment plan changes' });
    }

    // Fetch enrollment
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ error: 'Cannot modify enrollments from other schools' });
    }

    // Check if program dates are available
    if (!enrollment.programStartDate || !enrollment.programEndDate) {
      return res.status(400).json({ 
        error: 'Cannot calculate payment schedule - program dates are missing. Please update the enrollment with program start and end dates first.' 
      });
    }

    // Validate the frequency change
    const validation = validateFrequencyChange(
      enrollment.totalCost,
      enrollment.totalPaid || 0,
      new Date(enrollment.programStartDate),
      new Date(enrollment.programEndDate),
      paymentFrequency,
      new Date()
    );

    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Payment frequency change not allowed',
        validationErrors: validation.errors 
      });
    }

    // Recalculate payment schedule
    const newSchedule = recalculatePaymentSchedule(
      enrollment.totalCost,
      enrollment.totalPaid || 0,
      new Date(enrollment.programStartDate),
      new Date(enrollment.programEndDate),
      paymentFrequency,
      new Date()
    );

    // Store old values for audit log
    const oldFrequency = enrollment.paymentFrequency || 'one_time';
    const oldPaymentPlan = enrollment.paymentPlan;

    // Create audit log entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      adminEmail: userEmail,
      adminId: user.id,
      action: 'payment_plan_change',
      oldFrequency,
      newFrequency: paymentFrequency,
      oldPaymentPlan,
      comment: adminComment,
      calculatedSchedule: {
        numberOfPayments: newSchedule.numberOfPayments,
        paymentAmount: newSchedule.paymentAmount,
        finalPaymentAmount: newSchedule.finalPaymentAmount,
        paymentDates: newSchedule.paymentDates.map(d => d.toISOString())
      }
    };

    // Update enrollment metadata with audit log
    const currentMetadata = enrollment.metadata || {};
    const paymentPlanHistory = currentMetadata.paymentPlanHistory || [];
    paymentPlanHistory.push(auditEntry);

    // Determine new payment plan type based on frequency
    let newPaymentPlan: 'full_payment' | 'deposit_only' | 'monthly' | 'custom' = 'full_payment';
    if (paymentFrequency === 'monthly') {
      newPaymentPlan = 'monthly';
    } else if (paymentFrequency !== 'one_time') {
      newPaymentPlan = 'custom'; // weekly/biweekly are custom plans
    }

    // Update Stripe subscription schedule if it exists
    let stripeUpdateResult: any = null;
    if (enrollment.stripeSubscriptionId) {
      try {
        console.log(`🔄 Updating Stripe subscription schedule for enrollment ${enrollmentId}`);
        const stripe = await getStripeClient();
        
        // Retrieve the subscription schedule from Stripe
        const subscriptionSchedules = await stripe.subscriptionSchedules.list({
          customer: enrollment.stripeCustomerId || undefined,
          limit: 10
        });

        const activeSchedule = subscriptionSchedules.data.find(
          schedule => schedule.metadata?.enrollmentId === String(enrollmentId)
        );

        if (activeSchedule && activeSchedule.status !== 'canceled' && activeSchedule.status !== 'completed') {
          // Update the subscription schedule with new phases
          console.log(`📋 Found active schedule: ${activeSchedule.id}`);
          
          // Cancel future phases and create new ones based on recalculated schedule
          // Note: This is a simplified approach - in production, you'd want more sophisticated handling
          console.log(`⚠️ Warning: Stripe subscription schedule update requires manual review. Schedule ID: ${activeSchedule.id}`);
          
          stripeUpdateResult = {
            message: 'Stripe subscription schedule requires manual update',
            scheduleId: activeSchedule.id,
            status: 'manual_review_required'
          };
        } else {
          console.log(`⚠️ No active Stripe subscription schedule found for enrollment ${enrollmentId}`);
          stripeUpdateResult = {
            message: 'No active subscription schedule found',
            status: 'no_schedule'
          };
        }
      } catch (stripeError) {
        console.error('Error updating Stripe subscription schedule:', stripeError);
        // Don't fail the entire operation if Stripe update fails
        stripeUpdateResult = {
          error: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error',
          status: 'error'
        };
      }
    }

    // Update enrollment in database
    await storage.updateProgramEnrollment(enrollment.id, {
      paymentFrequency,
      paymentPlan: newPaymentPlan,
      metadata: {
        ...currentMetadata,
        paymentPlanHistory,
        lastPaymentPlanUpdate: new Date().toISOString(),
        stripeUpdateResult
      }
    });

    // Fetch updated enrollment
    const updatedEnrollment = await storage.getProgramEnrollmentById(enrollmentId);

    console.log(`✅ Updated payment plan for enrollment ${enrollmentId}: ${oldFrequency} → ${paymentFrequency}`);

    res.json({
      success: true,
      enrollment: updatedEnrollment,
      newSchedule: {
        frequency: newSchedule.frequency,
        numberOfPayments: newSchedule.numberOfPayments,
        paymentAmount: newSchedule.paymentAmount,
        finalPaymentAmount: newSchedule.finalPaymentAmount,
        paymentDates: newSchedule.paymentDates,
        totalAmount: newSchedule.totalAmount
      },
      stripeUpdate: stripeUpdateResult,
      auditLog: auditEntry
    });

  } catch (error) {
    console.error('Error updating payment plan:', error);
    res.status(500).json({ 
      error: 'Failed to update payment plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/enrollments/:id/payment-plan
 * Get current payment plan details and preview for frequency changes
 * Requires school admin role - auth middleware applied at router registration
 */
router.get('/:enrollmentId/payment-plan', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);

    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user is a school admin
    const user = await storage.getUserByEmail(userEmail);
    if (!user || user.role !== 'schoolAdmin') {
      return res.status(403).json({ error: 'Only school administrators can view payment plans' });
    }

    // Fetch enrollment
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ error: 'Cannot view enrollments from other schools' });
    }

    // Get payment history
    const metadata = enrollment.metadata || {};
    const paymentPlanHistory = metadata.paymentPlanHistory || [];

    // Calculate previews for all frequencies
    const frequencies: PaymentFrequency[] = ['one_time', 'weekly', 'biweekly', 'monthly'];
    const previews: Record<string, any> = {};

    if (enrollment.programStartDate && enrollment.programEndDate) {
      for (const freq of frequencies) {
        const validation = validateFrequencyChange(
          enrollment.totalCost,
          enrollment.totalPaid || 0,
          new Date(enrollment.programStartDate),
          new Date(enrollment.programEndDate),
          freq,
          new Date()
        );

        if (validation.valid) {
          const schedule = recalculatePaymentSchedule(
            enrollment.totalCost,
            enrollment.totalPaid || 0,
            new Date(enrollment.programStartDate),
            new Date(enrollment.programEndDate),
            freq,
            new Date()
          );

          previews[freq] = {
            valid: true,
            schedule: {
              frequency: schedule.frequency,
              numberOfPayments: schedule.numberOfPayments,
              paymentAmount: schedule.paymentAmount,
              finalPaymentAmount: schedule.finalPaymentAmount,
              paymentDates: schedule.paymentDates,
              totalAmount: schedule.totalAmount
            }
          };
        } else {
          previews[freq] = {
            valid: false,
            errors: validation.errors
          };
        }
      }
    }

    res.json({
      enrollment: {
        id: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        totalCost: enrollment.totalCost,
        totalPaid: enrollment.totalPaid || 0,
        remainingBalance: enrollment.remainingBalance,
        currentFrequency: enrollment.paymentFrequency || 'one_time',
        paymentPlan: enrollment.paymentPlan,
        programStartDate: enrollment.programStartDate,
        programEndDate: enrollment.programEndDate,
        stripeSubscriptionId: enrollment.stripeSubscriptionId
      },
      paymentPlanHistory,
      frequencyPreviews: previews
    });

  } catch (error) {
    console.error('Error fetching payment plan:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/admin/enrollments/:id/reallocate-payment
 * Reallocate payments from one enrollment to another, convert to credit, or refund via Stripe
 * Requires school admin role - auth middleware applied at router registration
 * 
 * Body: { 
 *   targetType: 'enrollment' | 'credit' | 'refund',
 *   amount: number (in cents),
 *   targetEnrollmentId?: number (required if targetType is 'enrollment'),
 *   adminComment: string (required - justification for reallocation)
 * }
 */
router.post('/:enrollmentId/reallocate-payment', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    const { targetType, amount, targetEnrollmentId, adminComment } = req.body;

    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user is a school admin
    const user = await storage.getUserByEmail(userEmail);
    if (!user || user.role !== 'schoolAdmin') {
      return res.status(403).json({ error: 'Only school administrators can reallocate payments' });
    }

    // Validate input
    if (!targetType || !['enrollment', 'credit', 'refund'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type. Must be: enrollment, credit, or refund' });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number (in cents)' });
    }

    if (!adminComment || adminComment.trim().length === 0) {
      return res.status(400).json({ error: 'Admin comment is required to justify payment reallocation' });
    }

    if (targetType === 'enrollment' && !targetEnrollmentId) {
      return res.status(400).json({ error: 'Target enrollment ID is required when transferring to another enrollment' });
    }

    // Fetch source enrollment
    const sourceEnrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!sourceEnrollment) {
      return res.status(404).json({ error: 'Source enrollment not found' });
    }

    // Verify source enrollment belongs to admin's school
    if (sourceEnrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ error: 'Cannot reallocate payments from enrollments in other schools' });
    }

    // Validate amount doesn't exceed totalPaid
    const sourceTotalPaid = sourceEnrollment.totalPaid || 0;
    if (amount > sourceTotalPaid) {
      return res.status(400).json({ 
        error: 'Amount exceeds total paid',
        details: {
          requested: amount,
          available: sourceTotalPaid,
          availableFormatted: `$${(sourceTotalPaid / 100).toFixed(2)}`
        }
      });
    }

    // Build audit entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      adminEmail: userEmail,
      adminId: user.id,
      action: 'payment_reallocation',
      targetType,
      amount,
      amountFormatted: `$${(amount / 100).toFixed(2)}`,
      targetEnrollmentId: targetEnrollmentId || null,
      comment: adminComment
    };

    console.log(`💸 Admin ${userEmail} reallocating $${(amount / 100).toFixed(2)} from enrollment ${enrollmentId}`);
    console.log(`   Target: ${targetType}${targetEnrollmentId ? ` (enrollment ${targetEnrollmentId})` : ''}`);

    let result: any = { success: true, targetType, amount };

    // Handle each target type
    if (targetType === 'enrollment') {
      // Transfer to another enrollment
      const targetEnrollment = await storage.getProgramEnrollmentById(targetEnrollmentId);
      if (!targetEnrollment) {
        return res.status(404).json({ error: 'Target enrollment not found' });
      }

      // Verify target enrollment belongs to same school
      if (targetEnrollment.schoolId !== user.schoolId) {
        return res.status(403).json({ error: 'Cannot transfer payments to enrollments in other schools' });
      }

      // Check if transfer would cause overpayment
      const targetTotalPaid = targetEnrollment.totalPaid || 0;
      const targetNewTotalPaid = targetTotalPaid + amount;
      if (targetNewTotalPaid > targetEnrollment.totalCost) {
        return res.status(400).json({ 
          error: 'Transfer would result in overpayment on target enrollment',
          details: {
            targetCurrentPaid: targetTotalPaid,
            targetTotalCost: targetEnrollment.totalCost,
            transferAmount: amount,
            wouldExceedBy: targetNewTotalPaid - targetEnrollment.totalCost
          }
        });
      }

      // Update source enrollment
      const sourceNewTotalPaid = sourceTotalPaid - amount;
      const sourceNewBalance = Math.max(0, sourceEnrollment.totalCost - sourceNewTotalPaid);
      const sourceMetadata = (sourceEnrollment.metadata && typeof sourceEnrollment.metadata === 'object') 
        ? sourceEnrollment.metadata as Record<string, any> 
        : {};
      await storage.updateProgramEnrollment(enrollmentId, {
        totalPaid: sourceNewTotalPaid,
        remainingBalance: sourceNewBalance,
        paymentStatus: sourceNewBalance === 0 ? 'completed' : (sourceNewTotalPaid > 0 ? 'partial_payment' : 'pending'),
        metadata: {
          ...sourceMetadata,
          paymentReallocationHistory: [
            ...(Array.isArray(sourceMetadata.paymentReallocationHistory) ? sourceMetadata.paymentReallocationHistory : []),
            { ...auditEntry, direction: 'outgoing' }
          ]
        }
      });

      // Update target enrollment
      const targetNewBalance = Math.max(0, targetEnrollment.totalCost - targetNewTotalPaid);
      const targetMetadata = (targetEnrollment.metadata && typeof targetEnrollment.metadata === 'object') 
        ? targetEnrollment.metadata as Record<string, any> 
        : {};
      await storage.updateProgramEnrollment(targetEnrollmentId, {
        totalPaid: targetNewTotalPaid,
        remainingBalance: targetNewBalance,
        paymentStatus: targetNewBalance === 0 ? 'completed' : 'partial_payment',
        metadata: {
          ...targetMetadata,
          paymentReallocationHistory: [
            ...(Array.isArray(targetMetadata.paymentReallocationHistory) ? targetMetadata.paymentReallocationHistory : []),
            { ...auditEntry, direction: 'incoming', sourceEnrollmentId: enrollmentId }
          ]
        }
      });

      console.log(`✅ Transferred $${(amount / 100).toFixed(2)} from enrollment ${enrollmentId} to ${targetEnrollmentId}`);
      
      // Create payment allocations for reallocation (source of truth)
      // Find payment history record for this enrollment
      try {
        const parentUser = await storage.getUserByEmail(sourceEnrollment.parentEmail);
        if (parentUser) {
          const paymentHistoryRecords = await (storage as any).getStripePaymentsByUserId?.(parentUser.id) || [];
          const relevantPaymentHistory = paymentHistoryRecords.find((p: any) => p.status === 'succeeded');
          
          if (relevantPaymentHistory) {
            // Create outgoing allocation from source
            await storage.createPaymentAllocation({
              paymentHistoryId: relevantPaymentHistory.id,
              enrollmentId: enrollmentId,
              allocatedAmountCents: -amount,
              allocationType: 'reallocation_out',
              adminComment,
              metadata: { targetEnrollmentId, adminEmail: userEmail }
            });
            
            // Create incoming allocation to target
            await storage.createPaymentAllocation({
              paymentHistoryId: relevantPaymentHistory.id,
              enrollmentId: targetEnrollmentId,
              allocatedAmountCents: amount,
              allocationType: 'reallocation_in',
              adminComment,
              metadata: { sourceEnrollmentId: enrollmentId, adminEmail: userEmail }
            });
            console.log('✅ Created reallocation payment allocations');
          }
        }
      } catch (allocationError) {
        console.error('⚠️ Error creating reallocation allocations (non-blocking):', allocationError);
      }
      
      result.targetEnrollment = {
        id: targetEnrollmentId,
        childName: targetEnrollment.childName,
        className: targetEnrollment.className,
        newTotalPaid: targetNewTotalPaid,
        newRemainingBalance: targetNewBalance
      };

    } else if (targetType === 'credit') {
      // Convert to account credit
      const parentUser = await storage.getUserByEmail(sourceEnrollment.parentEmail);
      if (!parentUser) {
        return res.status(400).json({ error: 'Parent user not found for this enrollment' });
      }

      // Create credit record using unified credit system
      const credit = await storage.createCredit({
        userId: parentUser.id,
        schoolId: sourceEnrollment.schoolId,
        creditType: 'manual',
        creditAmountCents: amount,
        status: 'approved',
        approvedBy: user.id,
        title: `Payment Reallocation Credit`,
        description: `Reallocated from ${sourceEnrollment.className} enrollment for ${sourceEnrollment.childName}. ${adminComment}`,
        sourceType: 'payment_reallocation',
        sourceId: enrollmentId
      });

      // Update source enrollment
      const sourceNewTotalPaid = sourceTotalPaid - amount;
      const sourceNewBalance = Math.max(0, sourceEnrollment.totalCost - sourceNewTotalPaid);
      const sourceMetadata = (sourceEnrollment.metadata && typeof sourceEnrollment.metadata === 'object') 
        ? sourceEnrollment.metadata as Record<string, any> 
        : {};
      await storage.updateProgramEnrollment(enrollmentId, {
        totalPaid: sourceNewTotalPaid,
        remainingBalance: sourceNewBalance,
        paymentStatus: sourceNewBalance === 0 ? 'completed' : (sourceNewTotalPaid > 0 ? 'partial_payment' : 'pending'),
        metadata: {
          ...sourceMetadata,
          paymentReallocationHistory: [
            ...(Array.isArray(sourceMetadata.paymentReallocationHistory) ? sourceMetadata.paymentReallocationHistory : []),
            { ...auditEntry, creditId: credit.id }
          ]
        }
      });

      console.log(`✅ Created $${(amount / 100).toFixed(2)} credit for parent ${parentUser.email}`);
      
      // Create payment allocation for credit conversion (source of truth)
      try {
        const paymentHistoryRecords = await (storage as any).getStripePaymentsByUserId?.(parentUser.id) || [];
        const relevantPaymentHistory = paymentHistoryRecords.find((p: any) => p.status === 'succeeded');
        
        if (relevantPaymentHistory) {
          await storage.createPaymentAllocation({
            paymentHistoryId: relevantPaymentHistory.id,
            enrollmentId: enrollmentId,
            allocatedAmountCents: -amount,
            allocationType: 'reallocation_out',
            adminComment: `Converted to credit: ${adminComment}`,
            metadata: { creditId: credit.id, adminEmail: userEmail }
          });
          console.log('✅ Created credit conversion payment allocation');
        }
      } catch (allocationError) {
        console.error('⚠️ Error creating credit conversion allocation (non-blocking):', allocationError);
      }
      
      result.credit = {
        id: credit.id,
        amount: credit.creditAmountCents,
        parentEmail: parentUser.email
      };

    } else if (targetType === 'refund') {
      // Refund via Stripe
      // Find the original payment to refund
      const stripe = await getStripeClient();

      // Look for payments associated with this enrollment
      const paymentHistory = await storage.getPaymentsByParentEmail(sourceEnrollment.parentEmail);
      const enrollmentPayments = paymentHistory.filter((p: any) => {
        const enrollmentIds = p.enrollmentIds || [];
        return enrollmentIds.includes(enrollmentId) && p.status === 'completed';
      });

      if (enrollmentPayments.length === 0) {
        return res.status(400).json({ 
          error: 'No Stripe payment found for this enrollment',
          hint: 'Cannot process refund - no completed Stripe payments are linked to this enrollment'
        });
      }

      // Use the most recent payment
      const latestPayment = enrollmentPayments[0];
      
      if (!latestPayment.stripePaymentIntentId) {
        return res.status(400).json({ 
          error: 'Payment was not processed through Stripe',
          hint: 'Only Stripe payments can be refunded through this system'
        });
      }

      // Process Stripe refund
      let stripeRefund;
      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: latestPayment.stripePaymentIntentId,
          amount: amount,
          reason: 'requested_by_customer',
          metadata: {
            refundedBy: userEmail,
            enrollmentId: String(enrollmentId),
            reallocationAction: 'true',
            adminComment
          }
        });
        console.log(`💳 Stripe refund created: ${stripeRefund.id}`);
      } catch (stripeError: any) {
        console.error('Stripe refund error:', stripeError);
        return res.status(400).json({ 
          error: 'Stripe refund failed',
          details: stripeError.message || 'Unknown Stripe error'
        });
      }

      // Create refund record in database
      await storage.createRefund({
        schoolId: sourceEnrollment.schoolId,
        enrollmentId: enrollmentId,
        paymentId: latestPayment.id,
        amount: amount,
        reason: `Payment reallocation: ${adminComment}`,
        status: 'completed',
        stripeRefundId: stripeRefund.id,
        processedBy: user.id,
        metadata: {
          reallocationAudit: auditEntry,
          parentEmail: sourceEnrollment.parentEmail
        }
      });

      // Update source enrollment
      const sourceNewTotalPaid = sourceTotalPaid - amount;
      const sourceNewBalance = Math.max(0, sourceEnrollment.totalCost - sourceNewTotalPaid);
      const refundSourceMetadata = (sourceEnrollment.metadata && typeof sourceEnrollment.metadata === 'object') 
        ? sourceEnrollment.metadata as Record<string, any> 
        : {};
      await storage.updateProgramEnrollment(enrollmentId, {
        totalPaid: sourceNewTotalPaid,
        remainingBalance: sourceNewBalance,
        paymentStatus: sourceNewBalance === 0 ? 'completed' : (sourceNewTotalPaid > 0 ? 'partial_payment' : 'pending'),
        metadata: {
          ...refundSourceMetadata,
          paymentReallocationHistory: [
            ...(Array.isArray(refundSourceMetadata.paymentReallocationHistory) ? refundSourceMetadata.paymentReallocationHistory : []),
            { ...auditEntry, stripeRefundId: stripeRefund.id }
          ]
        }
      });

      console.log(`✅ Refunded $${(amount / 100).toFixed(2)} to ${sourceEnrollment.parentEmail}`);
      result.refund = {
        stripeRefundId: stripeRefund.id,
        amount: amount,
        status: stripeRefund.status
      };
    }

    // Cancel any pending scheduled payments for the source enrollment if fully reallocated
    const sourceNewTotalPaid = sourceTotalPaid - amount;
    if (sourceNewTotalPaid === 0) {
      try {
        const scheduledPayments = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
        const pendingPayments = scheduledPayments.filter(p => p.status === 'pending');
        
        for (const payment of pendingPayments) {
          await storage.updateScheduledPaymentStatus(payment.id, 'cancelled');
          console.log(`🗑️ Cancelled scheduled payment ${payment.id} for enrollment ${enrollmentId}`);
        }

        if (pendingPayments.length > 0) {
          result.cancelledScheduledPayments = pendingPayments.length;
        }
      } catch (scheduleError) {
        console.error('Error cancelling scheduled payments:', scheduleError);
        result.scheduledPaymentWarning = 'Some scheduled payments may need manual cancellation';
      }
    }

    // Fetch updated source enrollment
    const updatedSourceEnrollment = await storage.getProgramEnrollmentById(enrollmentId);

    res.json({
      ...result,
      sourceEnrollment: {
        id: enrollmentId,
        childName: sourceEnrollment.childName,
        className: sourceEnrollment.className,
        previousTotalPaid: sourceTotalPaid,
        newTotalPaid: updatedSourceEnrollment?.totalPaid || 0,
        newRemainingBalance: updatedSourceEnrollment?.remainingBalance || sourceEnrollment.totalCost
      },
      auditLog: auditEntry
    });

  } catch (error) {
    console.error('Error reallocating payment:', error);
    res.status(500).json({ 
      error: 'Failed to reallocate payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
