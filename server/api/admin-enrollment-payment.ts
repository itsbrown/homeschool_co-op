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

export default router;
