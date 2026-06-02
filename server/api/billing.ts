import { Router } from 'express';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { insertPaymentSchema, type InsertPayment } from '@shared/schema';
import { CurrencyUtils } from '@shared/currency-utils';
import { sendPaymentConfirmationEmail } from '../lib/email-service';
import { createClient } from '@supabase/supabase-js';
import { dataLayer } from '../services/dataLayer';
import { getStripeClient } from '../config/stripe';
import { supabaseAuth } from '../middleware/supabase-auth';
import {
  getChildrenForAuthenticatedParent,
  resolveParentDbUser,
} from '../lib/parent-auth-scope';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';
import { sumProfileStyleClassEnrollmentDueCents } from '../lib/profile-style-enrollment-due';
import {
  buildIdempotencyFingerprint,
  createInMemoryIdempotencyStore,
  resolveIdempotentReplay,
  type IdempotencyRecord,
} from '../services/idempotency-helper';
import {
  enrollmentPoolCentsForBalanceIntent,
  membershipCentsReservedForPaymentIntent,
  parseBalanceIntentCredits,
  totalCentsForBalanceAllocation,
} from '../lib/balance-payment-metadata';
import { resolveMembershipReserveForPaymentIntent } from '../lib/resolve-membership-reserve-for-payment';

const router = Router();
const PAY_BALANCE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
type PayBalanceResponsePayload = { success: true; clientSecret: string | null; paymentIntentId: string };
const payBalanceIdempotencyStore = createInMemoryIdempotencyStore<PayBalanceResponsePayload>();
type DivergenceAction = 'REFRESH_AND_REPRICE';

function sendRecoverableDivergence(
  res: any,
  details: {
    operation: string;
    authoritativeAmountCents: number;
    clientAmountRaw: unknown;
    clientAmountParsed: number | null;
    malformed: boolean;
  }
) {
  return res.status(409).json({
    success: false,
    error: 'AMOUNT_DIVERGENCE',
    recoverable: true,
    action: 'REFRESH_AND_REPRICE' as DivergenceAction,
    message: 'Client totals diverged from server-authoritative amounts. Refresh pricing and retry.',
    divergence: {
      operation: details.operation,
      clientAmountRaw: details.clientAmountRaw ?? null,
      clientAmountCents: details.clientAmountParsed,
      clientAmountMalformed: details.malformed,
      authoritativeAmountCents: details.authoritativeAmountCents,
      deltaCents: details.clientAmountParsed === null
        ? null
        : details.clientAmountParsed - details.authoritativeAmountCents,
    },
  });
}

function parseIntegerCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    return parsed;
  }

  return null;
}

export function splitCentsEvenly(totalCents: number, recipientCount: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (!Number.isInteger(recipientCount) || recipientCount <= 0) {
    throw new Error('recipientCount must be a positive integer');
  }

  const base = Math.floor(totalCents / recipientCount);
  const remainder = totalCents % recipientCount;
  return Array.from({ length: recipientCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Resolve a class row for a program enrollment.
 *
 * Program enrollments can reference a class via three different columns depending on how they were
 * created (cart checkout vs admin enrollment vs legacy migrations):
 *   - marketplaceClassId: marketplace classes table (the standard cart-checkout path)
 *   - programId:          legacy column kept for backwards compatibility
 *   - classId:            school_classes table (rarely used; schema-defined but no live writers)
 *
 * The previous billing-summary code only looked up `enrollment.classId` against the `classes`
 * table, which silently dropped most marketplace enrollments from the summary. This helper tries
 * each candidate ID against the `classes` table (which is what storage.getClassById queries) and
 * returns the first match, or null if none resolve.
 *
 * Callers should NOT use the return value as the source of truth for amounts — the canonical
 * owed cents for an enrollment come from `effective_balance` / `resolveEnrollmentEffectiveBalance`
 * (total_cost, total_paid, comp_amount_cents); not from stored `remaining_balance` alone.
 * This helper is for display-only fields like the class title.
 */
async function resolveClassForEnrollment(
  enrollment: { marketplaceClassId?: number | null; programId?: number | null; classId?: number | null }
): Promise<{ id: number; title: string; price: number } | null> {
  const candidateIds = [
    enrollment.marketplaceClassId,
    enrollment.programId,
    enrollment.classId,
  ].filter((id): id is number => typeof id === 'number' && id > 0);

  for (const id of candidateIds) {
    const cls = await storage.getClassById(id);
    if (cls) {
      return { id: cls.id, title: cls.title, price: cls.price };
    }
  }

  return null;
}

/** School id from enrollment.parent + class; fills gaps when rows lack explicit school_id. */
async function resolveSchoolIdForBalancePaymentIntent(
  firstEnrollment: any | null | undefined,
  parentUser: { schoolId?: number | null }
): Promise<number | undefined> {
  const direct = firstEnrollment?.schoolId ?? parentUser.schoolId;
  if (direct != null && direct !== '') return Number(direct);

  if (firstEnrollment?.childId != null) {
    const child = await storage.getChildById(Number(firstEnrollment.childId));
    if (child?.schoolId != null) return Number(child.schoolId);
  }

  const candidateIds = [
    firstEnrollment?.marketplaceClassId,
    firstEnrollment?.programId,
    firstEnrollment?.classId,
  ].filter((id): id is number => typeof id === 'number' && id > 0);

  for (const id of candidateIds) {
    const cls = await storage.getClassById(id);
    const sid = cls && typeof (cls as any).schoolId === 'number' ? (cls as any).schoolId : null;
    if (sid != null) return Number(sid);
  }

  return undefined;
}

function getAuthoritativeRemainingBalanceCents(enrollment: any): number {
  return resolveEnrollmentEffectiveBalance(enrollment);
}

function parseAdvisoryAmountCents(value: unknown): { parsed: number | null; malformed: boolean } {
  if (value === null || value === undefined || value === '') {
    return { parsed: null, malformed: false };
  }

  const parsed = parseIntegerCents(value);
  if (parsed === null) {
    return { parsed: null, malformed: true };
  }

  return { parsed, malformed: false };
}

// Rate limiting for payment endpoints
const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 payment requests per windowMs
  message: {
    error: 'Too many payment requests, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper function to process balance payments with installment support
export async function processBalancePayment(paymentIntent: Stripe.PaymentIntent, userEmail: string, enrollmentIds: number[], totalAmount: number) {
  try {
    const { paymentPlan = 'full' } = paymentIntent.metadata;
    // PaymentIntent.amount is already the amount actually charged for this transaction.
    // Do not divide by plan cadence.
    const currentPaymentAmount = parseIntegerCents(paymentIntent.amount);
    if (currentPaymentAmount === null || currentPaymentAmount <= 0) {
      throw new Error('Payment intent amount must be a positive integer in cents');
    }
    
    const resolved = await resolveMembershipReserveForPaymentIntent(paymentIntent);
    const { creditsAppliedCents, originalAmountCents } = parseBalanceIntentCredits(
      paymentIntent.metadata as Record<string, string | undefined>,
    );
    const totalChargedCents =
      resolved?.allocationGrossCents ??
      totalCentsForBalanceAllocation({
        paymentIntentAmountCents: currentPaymentAmount,
        creditsAppliedCents,
        originalAmountCents,
      });
    const membershipCents =
      resolved?.membershipPortionThisPaymentCents ??
      membershipCentsReservedForPaymentIntent(currentPaymentAmount, paymentIntent.metadata as Record<string, string | undefined>, {
        allocationGrossCents: totalChargedCents,
      });
    const classPoolCents =
      resolved?.classPoolCents ?? enrollmentPoolCentsForBalanceIntent(totalChargedCents, membershipCents);

    console.log('💰 Processing balance payment with installment support:', {
      enrollmentIds,
      paymentPlan,
      currentPaymentAmount,
      totalAmount,
      membershipCentsReserved: membershipCents,
      creditsAppliedCents,
      originalAmountCents,
      totalChargedCents,
      classPoolCents,
    });
    
    // Get all enrollments
    const enrollments = [];
    for (const enrollmentId of enrollmentIds) {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (enrollment && enrollment.paymentStatus !== 'completed') {
        enrollments.push(enrollment);
      }
    }
    
    if (enrollments.length === 0) {
      console.log('⚠️ No valid enrollments found for payment processing');
      return;
    }
    
    const { fulfillMembershipFromCartPaymentIntent } = await import(
      '../services/fulfill-membership-payment-intent'
    );
    await fulfillMembershipFromCartPaymentIntent(paymentIntent);

    const { applyClassPoolToEnrollments } = await import('../lib/apply-class-pool-to-enrollments');
    const applyResult = await applyClassPoolToEnrollments(
      paymentIntent,
      enrollments.map((e) => e.id),
    );
    console.log('✅ applyClassPoolToEnrollments from processBalancePayment:', applyResult);

    const { cancelPendingScheduledAfterEnrollmentPayoff } = await import(
      '../lib/cancel-pending-scheduled-after-payoff'
    );
    const cancelledInstallments = await cancelPendingScheduledAfterEnrollmentPayoff(
      applyResult.enrollmentIds,
    );
    if (cancelledInstallments > 0) {
      console.log(
        `🧹 Cancelled ${cancelledInstallments} pending scheduled payment(s) after balance payoff`,
      );
    }
    
    // Create payment record with installment details
    // Get schoolId from enrollment or parent user - NEVER allow hardcoded fallback
    const parentUser = await storage.getUserByEmail(userEmail);
    const schoolId = enrollments[0]?.schoolId || parentUser?.schoolId;
    
    if (!schoolId) {
      throw new Error(`Cannot create payment record: No valid school ID found for parent ${userEmail}`);
    }
    
    const paymentRecord: InsertPayment = {
      schoolId,
      parentId: parentUser?.id || null,
      stripePaymentIntentId: paymentIntent.id,
      parentEmail: userEmail,
      childName: enrollments[0].childName || 'Multiple Children',
      className: enrollments.length > 1 ? 'Multiple Classes' : enrollments[0].className || 'Class',
      description: `Payment for ${enrollments.length} enrollment(s) - ${paymentPlan} plan`,
      amount: totalChargedCents,
      currency: paymentIntent.currency || 'usd',
      status: 'completed' as const,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe' as const,
      enrollmentIds: enrollmentIds,
      metadata: {
        enrollmentIds: enrollmentIds,
        paymentDate: new Date().toISOString(),
        paymentPlan,
        installmentNumber: 1,
        totalInstallments: 1,
        isFirstInstallment: true,
        ...(creditsAppliedCents > 0
          ? {
              creditsAppliedCents,
              stripeChargedCents: currentPaymentAmount,
              originalAmountCents: originalAmountCents || currentPaymentAmount + creditsAppliedCents,
            }
          : {}),
      },
      paymentDate: new Date()
    };
    
    const createdPayment = await storage.createPayment(paymentRecord);
    console.log('✅ Payment record created:', paymentRecord.stripePaymentIntentId);

    if (creditsAppliedCents > 0 && parentUser?.id) {
      try {
        const { consumeCreditsFromPaymentIntentMetadata } = await import(
          '../lib/fulfill-balance-payment-intent.js'
        );
        const { creditsConsumedCents, creditsSkippedAlreadyApplied } =
          await consumeCreditsFromPaymentIntentMetadata(paymentIntent, createdPayment.id);
        console.log(`💰 Credits for checkout ${paymentIntent.id}:`, {
          creditsConsumedCents,
          creditsSkippedAlreadyApplied,
        });
      } catch (creditErr) {
        console.error('❌ Failed to consume credits after checkout payment:', creditErr);
      }
    }
    
    // Payment plans are now handled by Stripe Subscription Schedules in the stripe-payment-plans service
    // No manual scheduled payments needed - all payment scheduling is managed by Stripe
    
    // Add small delay to ensure all storage operations are committed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send real-time update AFTER all storage operations are complete
    await dataLayer.refreshUserData(userEmail);
    console.log('📡 Real-time billing update sent after storage commit');
    
  } catch (error) {
    console.error('❌ Error processing balance payment:', error);
    throw error;
  }
}

// DEPRECATED: Legacy scheduled installments - now handled by Stripe Subscription Schedules
// This function is kept for reference but should not be used in new code
// All payment plans are now managed directly through Stripe's native APIs

// Create payment intent
router.post('/create-payment-intent', paymentRateLimit, supabaseAuth, async (req: any, res) => {
  try {
    const { amount, currency = 'usd', parentEmail, enrollmentDetails, paymentPlan = 'full' } = req.body;
    const authenticatedEmail = req.user?.email;
    if (!authenticatedEmail) {
      return res.status(401).json({
        success: false,
        error: 'User email not found'
      });
    }

    const effectiveParentEmail = typeof parentEmail === 'string' && parentEmail.trim().length > 0
      ? parentEmail.trim()
      : authenticatedEmail;
    if (effectiveParentEmail !== authenticatedEmail) {
      return res.status(403).json({
        success: false,
        error: 'Cannot create payment intent for another parent'
      });
    }

    if (!Array.isArray(enrollmentDetails) || enrollmentDetails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'enrollmentDetails is required'
      });
    }

    // Get parent user and schoolId before creating payment record
    const parentUser = await storage.getUserByEmail(effectiveParentEmail);
    if (!parentUser) {
      return res.status(404).json({
        success: false,
        error: 'Parent user not found'
      });
    }

    const enrollmentIds = enrollmentDetails
      .map((e: any) => parseIntegerCents(e?.enrollmentId))
      .filter((id: number | null): id is number => id !== null && id > 0);

    if (enrollmentIds.length === 0 || enrollmentIds.length !== enrollmentDetails.length) {
      return res.status(400).json({
        success: false,
        error: 'enrollmentDetails must contain valid enrollmentId values'
      });
    }

    const authoritativeEnrollments = await Promise.all(
      enrollmentIds.map((id: number) => storage.getProgramEnrollmentById(id))
    );
    const validEnrollments = authoritativeEnrollments.filter((enrollment): enrollment is NonNullable<typeof enrollment> =>
      !!enrollment && (
        enrollment.parentId === parentUser.id ||
        enrollment.parentEmail === effectiveParentEmail
      )
    );

    if (validEnrollments.length !== enrollmentIds.length) {
      return res.status(403).json({
        success: false,
        error: 'One or more enrollments are not owned by this parent'
      });
    }

    const authoritativeAmountCents = validEnrollments.reduce((sum, enrollment) => {
      return sum + getAuthoritativeRemainingBalanceCents(enrollment);
    }, 0);
    if (authoritativeAmountCents <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No outstanding balance found for selected enrollments'
      });
    }

    const advisoryAmount = parseAdvisoryAmountCents(amount);
    if (advisoryAmount.malformed) {
      console.warn('⚠️ Malformed client amount diverged from server-computed amount:', {
        clientAmount: amount,
        authoritativeAmount: authoritativeAmountCents
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_create_payment_intent',
        authoritativeAmountCents,
        clientAmountRaw: amount,
        clientAmountParsed: advisoryAmount.parsed,
        malformed: true,
      });
    } else if (advisoryAmount.parsed !== null && advisoryAmount.parsed !== authoritativeAmountCents) {
      console.warn('⚠️ Client amount mismatch diverged from server-computed amount:', {
        clientAmount: advisoryAmount.parsed,
        authoritativeAmount: authoritativeAmountCents
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_create_payment_intent',
        authoritativeAmountCents,
        clientAmountRaw: amount,
        clientAmountParsed: advisoryAmount.parsed,
        malformed: false,
      });
    }

    console.log('💳 Payment plan details:', {
      paymentPlan,
      totalAmount: authoritativeAmountCents
    });

    // Create payment intent
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: authoritativeAmountCents,
      currency,
      // Card-only: avoids Dashboard APM bundles that require return_url on server-side confirm / CLI.
      payment_method_types: ['card'],
      metadata: {
        parentEmail: effectiveParentEmail,
        enrollmentDetails: JSON.stringify(enrollmentDetails),
        paymentPlan,
        paymentType: 'balance_payment',
        enrollmentIds: JSON.stringify(enrollmentIds)
      }
    });
    
    // Get schoolId from first enrollment or parent
    const firstEnrollment = validEnrollments[0] || null;

    const schoolId = await resolveSchoolIdForBalancePaymentIntent(firstEnrollment, parentUser);
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot create payment: No valid school ID found'
      });
    }

    // Store payment in database
    const paymentData: InsertPayment = {
      status: 'pending',
      parentEmail: effectiveParentEmail,
      stripePaymentIntentId: paymentIntent.id,
      amount: authoritativeAmountCents,
      currency,
      childName: 'Multiple Children',
      className: 'Multiple Classes',
      description: `Payment for ${enrollmentIds.length} enrollment(s)`,
      schoolId: schoolId,
      parentId: parentUser.id,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe' as const,
      enrollmentIds,
      paymentDate: null,
      metadata: {
        enrollmentDetails,
        clientSecret: paymentIntent.client_secret,
        advisoryClientAmount: advisoryAmount.parsed,
        advisoryClientAmountMalformed: advisoryAmount.malformed
      }
    };

    await storage.createPayment(paymentData);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
});

// Process individual enrollment payment
router.post('/enrollments/:enrollmentId/payment', async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { amount, paymentType } = req.body;

    console.log(`💰 Processing individual enrollment payment: ${enrollmentId}, amount: ${amount}, type: ${paymentType}`);

    // Get the enrollment
    const enrollment = await storage.getProgramEnrollmentById(parseInt(enrollmentId));
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        error: 'Enrollment not found'
      });
    }

    // Server-authoritative amount: always apply the persisted remaining balance.
    const currentAmount = enrollment.totalPaid || 0;
    const appliedAmount = getAuthoritativeRemainingBalanceCents(enrollment);
    if (appliedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No outstanding balance found for this enrollment'
      });
    }
    const newAmount = currentAmount + appliedAmount;
    const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);

    const advisoryAmount = parseAdvisoryAmountCents(amount);
    if (advisoryAmount.malformed) {
      console.warn('⚠️ Malformed client amount ignored in favor of server enrollment balance:', {
        clientAmount: amount,
        authoritativeAmount: appliedAmount
      });
    } else if (advisoryAmount.parsed !== null && advisoryAmount.parsed !== appliedAmount) {
      console.warn('⚠️ Client amount mismatch ignored in favor of server enrollment balance:', {
        clientAmount: advisoryAmount.parsed,
        authoritativeAmount: appliedAmount
      });
    }

    await storage.updateProgramEnrollment(enrollment.id, {
      totalPaid: newAmount,
      remainingBalance: remainingBalance,
      status: 'enrolled'
    });

    // Create payment record for history tracking
    const paymentData: InsertPayment = {
      stripePaymentIntentId: `enrollment_${enrollmentId}_${Date.now()}`,
      parentEmail: enrollment.parentEmail,
      childName: enrollment.childName,
      className: enrollment.className,
      description: `Payment for enrollment ${enrollmentId}`,
      amount: appliedAmount,
      currency: 'usd',
      status: 'completed',
      schoolId: enrollment.schoolId || 0,
      parentId: enrollment.parentId || null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe' as const,
      enrollmentIds: [parseInt(enrollmentId)],
      metadata: {
        enrollmentId: parseInt(enrollmentId),
        paymentType: paymentType || 'enrollment_payment',
        previousAmount: currentAmount,
        newAmount: newAmount,
        remainingBalance: remainingBalance
      },
      paymentDate: new Date()
    };

    await storage.createPayment(paymentData);

    console.log(`✅ Updated enrollment ${enrollmentId}: totalPaid=${newAmount}, remaining=${remainingBalance}`);
    console.log(`✅ Created payment record for enrollment ${enrollmentId}`);

    const updatedEnrollment = {
      ...enrollment,
      totalPaid: newAmount,
      remainingBalance: remainingBalance,
      status: 'enrolled' as const
    };

    res.json({
      success: true,
      enrollment: updatedEnrollment
    });

  } catch (error) {
    console.error('❌ Error processing enrollment payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment'
    });
  }
});

// Get payment status
router.get('/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    
    const payment = await storage.getPaymentByStripeId(paymentIntentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Also check Stripe for the latest status
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: paymentIntent.status,
        amount: payment.amount,
        currency: payment.currency,
        parentEmail: payment.parentEmail,
        createdAt: payment.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment status'
    });
  }
});

// Get billing summary for a parent
router.get('/summary', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'test') {
      const testEmail = req.headers['x-test-user-email'] as string | undefined;
      if (testEmail) {
        const userEmail = testEmail;
        const children = await getChildrenForAuthenticatedParent(storage, { email: userEmail });
        if (!children || children.length === 0) {
          return res.json({
            totalBalance: 0,
            totalBalanceFormatted: '$0.00',
            enrollmentCount: 0,
            enrollmentDetails: [],
            parentEmail: userEmail
          });
        }

        const childIds = children.map(child => child.id);
        const allEnrollments = await storage.getEnrollmentsByChildIds(childIds);

        const enrollmentDetails = [];
        let totalBalance = 0;
        for (const enrollment of allEnrollments) {
          const classIdForLookup =
            enrollment.marketplaceClassId ?? enrollment.programId ?? enrollment.classId;
          let classItem = null;
          if (classIdForLookup) {
            classItem = await storage.getClassById(classIdForLookup);
          }

          const paidAmount = enrollment.totalPaid || 0;
          const classCost = enrollment.totalCost || 0;
          const balance = resolveEnrollmentEffectiveBalance(enrollment);
          if (balance > 0) {
            totalBalance += balance;
          }

          enrollmentDetails.push({
            enrollmentId: enrollment.id,
            childName: enrollment.childName,
            className: classItem?.title || enrollment.className || 'Unknown Class',
            classCost,
            amountPaid: paidAmount,
            balance,
            classDate: classItem?.startDate || null,
            status: enrollment.status,
            paymentStatus: enrollment.paymentStatus
          });
        }

        const profileStyleTestCents = sumProfileStyleClassEnrollmentDueCents(allEnrollments);
        const driftTestCents = Math.abs(totalBalance - profileStyleTestCents);
        if (driftTestCents > 1) {
          const parentDb = await resolveParentDbUser(storage, { email: userEmail });
          console.warn(
            '[billing/summary test] Enrollment total diverges from parent-profile-style class due.',
            {
              parentEmail: userEmail,
              parentDbUserId: parentDb?.id ?? null,
              billingSummaryEnrollmentTotalCents: totalBalance,
              profileStyleClassEnrollmentDueCents: profileStyleTestCents,
              driftCents: driftTestCents,
            },
          );
        }

        return res.json({
          totalBalance,
          totalBalanceFormatted: CurrencyUtils.format(totalBalance),
          enrollmentCount: allEnrollments.length,
          enrollmentDetails,
          parentEmail: userEmail
        });
      }
    }

    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    console.log('🔍 Getting billing summary for:', userEmail);

    // Get all children for this parent
    const children = await getChildrenForAuthenticatedParent(storage, {
      email: userEmail,
      supabaseId: user.id,
    });
    if (!children || children.length === 0) {
      console.log('📋 No children found for parent:', userEmail);
      return res.json({
        totalBalance: 0,
        totalBalanceFormatted: '$0.00',
        enrollmentCount: 0,
        enrollmentDetails: [],
        parentEmail: userEmail
      });
    }

    const childIds = children.map(child => child.id);
    console.log('👶 Found children:', childIds);

    // Get all enrollments for these children (using individual child lookups)
    const allEnrollments = [];
    for (const childId of childIds) {
      const childEnrollments = await storage.getEnrollmentsByChildId(childId);
      allEnrollments.push(...childEnrollments);
    }
    console.log('📋 Found enrollments:', allEnrollments.length);

    // Calculate enrollment details with balances.
    //
    // C3 fix: Resolve the class via marketplaceClassId | programId | classId — not just classId.
    // The schema allows any of these and most production rows use marketplaceClassId. The previous
    // implementation looked up only enrollment.classId and then `continue`-d if the class was not
    // found, silently dropping ~88% of marketplace enrollments from the summary while the cart
    // drawer (which doesn't do this lookup) showed them. That divergence is the dominant source of
    // "I don't see my balance" reports.
    //
    // We also stop dropping enrollments when the class lookup fails. Owed cents use
    // resolveEnrollmentEffectiveBalance (DB `effective_balance` or same formula), never raw
    // `remaining_balance` — Stripe-managed rows often store remaining_balance = 0 while still owed.
    const enrollmentDetails = [];
    let totalBalance = 0;

    for (const enrollment of allEnrollments) {
      const classDetails = await resolveClassForEnrollment(enrollment);

      const child = children.find(c => c.id === enrollment.childId);
      if (!child) continue;

      const totalAmount = enrollment.totalCost ?? classDetails?.price ?? 0;
      const totalPaid = enrollment.totalPaid ?? (enrollment as any).amount ?? 0;
      const balance = resolveEnrollmentEffectiveBalance(enrollment);

      enrollmentDetails.push({
        enrollmentId: enrollment.id,
        childName: `${child.firstName} ${child.lastName}`,
        className: classDetails?.title ?? '(class details unavailable)',
        classType: enrollment.classType,
        classPrice: totalAmount,
        amountPaid: totalPaid,
        balance: balance,
        status: enrollment.status,
        enrollmentDate: enrollment.enrollmentDate,
        depositRequired: enrollment.depositRequired || Math.round(totalAmount * 0.1)
      });

      if (balance > 0) {
        totalBalance += balance;
      }
    }

    // Get pending scheduled payments (payment plan installments not yet paid)
    let scheduledPaymentsTotal = 0;
    let pendingScheduledPayments: Array<{
      id: number;
      amount: number;
      scheduledDate: Date;
      installmentNumber: number;
      totalInstallments: number;
      status: string;
    }> = [];
    
    try {
      const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
      pendingScheduledPayments = allScheduledPayments
        .filter(p => p.status === 'pending')
        .map(p => ({
          id: p.id,
          amount: p.amount,
          scheduledDate: p.scheduledDate,
          installmentNumber: p.installmentNumber,
          totalInstallments: p.totalInstallments,
          status: p.status
        }));
      
      scheduledPaymentsTotal = pendingScheduledPayments.reduce((sum, p) => sum + p.amount, 0);
      console.log(`📅 Found ${pendingScheduledPayments.length} pending scheduled payments totaling ${scheduledPaymentsTotal} cents`);
    } catch (error) {
      console.log('⚠️ Could not fetch scheduled payments:', error);
    }
    
    // C2: scheduled_payments are installments of the same enrollment debt; adding them on top of
    // remaining_balance double-counts. Expose schedule totals separately; canonical owed = enrollments.
    const canonicalBalance = totalBalance;

    const profileStyleClassEnrollmentDueCents =
      sumProfileStyleClassEnrollmentDueCents(allEnrollments);
    const driftVsProfileStyleCents = Math.abs(
      canonicalBalance - profileStyleClassEnrollmentDueCents,
    );
    if (driftVsProfileStyleCents > 1) {
      const parentDb = await resolveParentDbUser(storage, {
        email: userEmail,
        supabaseId: user.id,
      });
      console.warn(
        '[billing/summary] Enrollment total diverges from parent-profile-style class due (same enrollment rows; admin parent-profile excludes some statuses from class amount due).',
        {
          parentEmail: userEmail,
          parentDbUserId: parentDb?.id ?? null,
          billingSummaryEnrollmentTotalCents: canonicalBalance,
          profileStyleClassEnrollmentDueCents: profileStyleClassEnrollmentDueCents,
          driftCents: driftVsProfileStyleCents,
        },
      );
    }

    const summary = {
      totalBalance: canonicalBalance,
      totalBalanceFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(canonicalBalance / 100),
      enrollmentBalance: totalBalance,
      scheduledPaymentsBalance: scheduledPaymentsTotal,
      pendingScheduledPayments: pendingScheduledPayments.length,
      enrollmentCount: enrollmentDetails.length,
      enrollmentDetails: enrollmentDetails,
      parentEmail: userEmail
    };

    console.log('✅ Billing summary generated:', {
      canonicalBalance,
      enrollmentBalance: totalBalance,
      scheduledPaymentsBalance: scheduledPaymentsTotal,
      pendingScheduledPayments: pendingScheduledPayments.length,
      enrollmentCount: enrollmentDetails.length,
      parentEmail: userEmail
    });

    res.json(summary);
  } catch (error) {
    console.error('❌ Error getting billing summary:', error);
    res.status(500).json({ 
      error: 'Failed to get billing summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Pay balance endpoint
router.post('/pay-balance', async (req, res) => {
  try {
    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    const { enrollmentIds, paymentDetails, paymentPlan } = req.body;
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ error: 'enrollmentIds is required' });
    }

    const userChildren = await getChildrenForAuthenticatedParent(storage, {
      email: userEmail,
      supabaseId: user.id,
    });
    const userChildIds = new Set(userChildren.map(c => c.id));
    const targetEnrollments = await Promise.all(
      enrollmentIds.map((id: number) => storage.getProgramEnrollmentById(id))
    );
    const validEnrollments = targetEnrollments.filter((enrollment): enrollment is NonNullable<typeof enrollment> =>
      !!enrollment && userChildIds.has(enrollment.childId)
    );

    if (validEnrollments.length !== enrollmentIds.length) {
      return res.status(403).json({ error: 'One or more enrollments are not owned by this user' });
    }

    const amountCents = validEnrollments.reduce((sum, enrollment) => {
      return sum + getAuthoritativeRemainingBalanceCents(enrollment);
    }, 0);

    if (amountCents <= 0) {
      return res.status(400).json({ error: 'No outstanding balance found for selected enrollments' });
    }

    const advisoryClientTotalRaw =
      paymentDetails?.totalAmountCents ??
      paymentDetails?.amount ??
      paymentDetails?.total ??
      req.body?.total;
    const advisoryClientTotal = parseAdvisoryAmountCents(advisoryClientTotalRaw);
    if (advisoryClientTotal.malformed) {
      console.warn('⚠️ Malformed client total diverged from server-computed balance amount:', {
        clientTotal: advisoryClientTotalRaw,
        authoritativeAmount: amountCents
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_pay_balance',
        authoritativeAmountCents: amountCents,
        clientAmountRaw: advisoryClientTotalRaw,
        clientAmountParsed: advisoryClientTotal.parsed,
        malformed: true,
      });
    } else if (advisoryClientTotal.parsed !== null && advisoryClientTotal.parsed !== amountCents) {
      console.warn('⚠️ Client total mismatch diverged from server-computed balance amount:', {
        clientTotal: advisoryClientTotal.parsed,
        authoritativeAmount: amountCents
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_pay_balance',
        authoritativeAmountCents: amountCents,
        clientAmountRaw: advisoryClientTotalRaw,
        clientAmountParsed: advisoryClientTotal.parsed,
        malformed: false,
      });
    }

    const idempotencyKeyRaw = req.get('Idempotency-Key');
    const idempotencyKey = typeof idempotencyKeyRaw === 'string' ? idempotencyKeyRaw.trim() : '';
    const schoolIdForFingerprint = validEnrollments[0]?.schoolId ?? null;
    const idempotencyFingerprint = idempotencyKey
      ? buildIdempotencyFingerprint({
          parentEmail: userEmail,
          enrollmentIds: enrollmentIds as number[],
          amountCents,
          operation: 'billing_pay_balance',
          schoolId: schoolIdForFingerprint,
        })
      : null;

    if (idempotencyKey && idempotencyFingerprint) {
      try {
        const replay = resolveIdempotentReplay(
          payBalanceIdempotencyStore,
          idempotencyKey,
          idempotencyFingerprint
        );
        if (replay.replay) {
          console.log('♻️ Idempotent pay-balance replay served from cache');
          return res.json(replay.response);
        }
      } catch (idempotencyError: any) {
        if (idempotencyError?.message === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD') {
          return res.status(409).json({
            success: false,
            error: 'Idempotency key reused with different payload'
          });
        }
        throw idempotencyError;
      }
    }

    console.log('💳 Processing payment for:', userEmail, 'Amount (cents):', amountCents);

    // Create payment intent
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        parentEmail: userEmail,
        enrollmentIds: JSON.stringify(enrollmentIds),
        amountCents: amountCents.toString(),
        paymentPlan: paymentPlan,
        paymentType: 'balance_payment'
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    const responsePayload: PayBalanceResponsePayload = {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };

    if (idempotencyKey && idempotencyFingerprint) {
      const record: IdempotencyRecord<PayBalanceResponsePayload> = {
        key: idempotencyKey,
        fingerprint: idempotencyFingerprint,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + PAY_BALANCE_IDEMPOTENCY_TTL_MS,
        response: responsePayload,
      };
      payBalanceIdempotencyStore.set(record);
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
});

// Confirm payment and update enrollment statuses
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, enrollmentIds, amount, paymentDate } = req.body;

    console.log('💳 Confirming payment:', paymentIntentId, 'for enrollments:', enrollmentIds);

    // Extract user email from Supabase token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the Supabase token
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Supabase auth error:', error);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'User email not found' });
    }

    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0 || enrollmentIds.some((id: unknown) => !Number.isInteger(id))) {
      return res.status(400).json({
        success: false,
        error: 'enrollmentIds must be a non-empty array of integer IDs'
      });
    }

    // Get user's children to verify ownership and block unauthorized requests before detail validation.
    const userChildren = await getChildrenForAuthenticatedParent(storage, {
      email: userEmail,
      supabaseId: user.id,
    });
    const userChildIds = new Set(userChildren.map(child => child.id));
    const targetEnrollments = await Promise.all(
      enrollmentIds.map((id: number) => storage.getProgramEnrollmentById(id))
    );
    const validEnrollments = targetEnrollments.filter((enrollment): enrollment is NonNullable<typeof enrollment> =>
      !!enrollment && userChildIds.has(enrollment.childId)
    );
    if (validEnrollments.length !== enrollmentIds.length) {
      return res.status(403).json({
        success: false,
        error: 'One or more enrollments are not owned by this user'
      });
    }

    // Server-authoritative amount from persisted enrollment balances.
    const authoritativeTotalAmount = validEnrollments.reduce((sum, enrollment) => {
      return sum + getAuthoritativeRemainingBalanceCents(enrollment);
    }, 0);
    if (authoritativeTotalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No outstanding balance found for selected enrollments'
      });
    }

    const advisoryAmount = parseAdvisoryAmountCents(amount);
    if (advisoryAmount.malformed) {
      console.warn('⚠️ Malformed confirm-payment amount diverged from server-computed amount:', {
        clientAmount: amount,
        authoritativeAmount: authoritativeTotalAmount
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_confirm_payment',
        authoritativeAmountCents: authoritativeTotalAmount,
        clientAmountRaw: amount,
        clientAmountParsed: advisoryAmount.parsed,
        malformed: true,
      });
    } else if (advisoryAmount.parsed !== null && advisoryAmount.parsed !== authoritativeTotalAmount) {
      console.warn('⚠️ confirm-payment amount mismatch diverged from server-computed amount:', {
        clientAmount: advisoryAmount.parsed,
        authoritativeAmount: authoritativeTotalAmount
      });
      return sendRecoverableDivergence(res, {
        operation: 'billing_confirm_payment',
        authoritativeAmountCents: authoritativeTotalAmount,
        clientAmountRaw: amount,
        clientAmountParsed: advisoryAmount.parsed,
        malformed: false,
      });
    }

    const updatedEnrollments: any[] = [];
    for (const enrollment of validEnrollments) {
      const amountForEnrollment = getAuthoritativeRemainingBalanceCents(enrollment);
      const updatedTotalPaid = (enrollment.totalPaid || 0) + amountForEnrollment;
      const updatedRemainingBalance = Math.max(0, (enrollment.totalCost || 0) - updatedTotalPaid);
      console.log(`🔄 Updating enrollment ${enrollment.id} from status '${enrollment.status}' to 'completed'`);

      await storage.updateProgramEnrollment(enrollment.id, {
        status: 'completed',
        totalPaid: updatedTotalPaid,
        remainingBalance: updatedRemainingBalance,
        notes: enrollment.notes ? `${enrollment.notes}\nPayment of $${amountForEnrollment / 100} received on ${new Date().toISOString()}` : `Payment of $${amountForEnrollment / 100} received on ${new Date().toISOString()}`
      });

      updatedEnrollments.push({
        ...enrollment,
        status: 'completed' as const,
        totalPaid: updatedTotalPaid,
        remainingBalance: updatedRemainingBalance,
        amountAppliedCents: amountForEnrollment,
      });
      console.log('✅ Updated enrollment:', enrollment.id, 'status to completed, amount paid:', amountForEnrollment);
    }

    // Get child and class details for payment record
    let childName = 'Multiple Children';
    let className = 'Multiple Classes';
    
    if (updatedEnrollments.length === 1) {
      const enrollment = updatedEnrollments[0];
      const child = enrollment.childId ? await storage.getChildById(enrollment.childId) : null;
      const classDetails = enrollment.classId ? await storage.getClassById(enrollment.classId) : null;
      childName = child ? `${child.firstName} ${child.lastName}` : 'Unknown Child';
      className = classDetails?.title || classDetails?.description || 'Unknown Class';
    }

    // Get parent and school info for payment record
    const parentUser = await storage.getUserByEmail(userEmail);
    const schoolId = updatedEnrollments[0]?.schoolId || parentUser?.schoolId;
    
    // Create payment record
    const paymentRecord: InsertPayment = {
      stripePaymentIntentId: paymentIntentId,
      parentEmail: userEmail,
      childName: childName,
      className: className,
      amount: authoritativeTotalAmount,
      currency: 'usd',
      status: 'completed' as const,
      description: `Payment for ${enrollmentIds.length} enrollment(s)`,
      schoolId: schoolId || 0,
      parentId: parentUser?.id || null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe' as const,
      enrollmentIds: enrollmentIds,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      metadata: {
        enrollmentIds: enrollmentIds,
        paymentDate: paymentDate
      }
    };

    let createdPayment: any;
    try {
      createdPayment = await storage.createPayment(paymentRecord);
    } catch (error) {
      console.log('⚠️ Payment record creation failed, continuing with email...');
      createdPayment = { 
        ...paymentRecord, 
        id: Date.now(), 
        createdAt: new Date(), 
        updatedAt: new Date()
      };
    }

    // Send confirmation email
    try {
      const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
      
      const enrollmentDetails = await Promise.all(updatedEnrollments.map(async (enrollment) => {
        const child = enrollment.childId ? await storage.getChildById(enrollment.childId) : null;
        const classDetails = enrollment.classId ? await storage.getClassById(enrollment.classId) : null;
        return {
          childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown Child',
          className: classDetails?.title || classDetails?.description || 'Unknown Class',
          price: classDetails?.price || 0,
          amountPaid: enrollment.amountAppliedCents || 0,
        };
      }));

      const emailSent = await sendPaymentConfirmationEmail({
        parentEmail: userEmail,
        parentName: user.user_metadata?.full_name || 'Parent',
        payment: createdPayment,
        enrollmentDetails: enrollmentDetails,
      });

      console.log('📧 Confirmation email sent:', emailSent);
    } catch (emailError) {
      console.error('❌ Error sending confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: 'Payment confirmed and enrollments updated',
      updatedEnrollments: updatedEnrollments.length,
      paymentId: createdPayment.id
    });

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm payment'
    });
  }
});

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    const { parentEmail, parentName, enrollmentDetails } = req.body;
    
    const { sendPaymentConfirmationEmail } = await import('../lib/email-service');
    
    const mockPayment = {
      id: Date.now(),
      stripePaymentIntentId: 'test_intent_123',
      parentEmail: parentEmail,
      childName: enrollmentDetails[0]?.childName || 'Test Child',
      className: enrollmentDetails[0]?.className || 'Test Class',
      amount: enrollmentDetails[0]?.amountPaid || 900,
      currency: 'usd',
      status: 'completed' as const,
      description: 'Test payment',
      schoolId: 1,
      parentId: null,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      paymentMethod: 'stripe' as const,
      enrollmentIds: [],
      paymentDate: new Date(),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('🧪 Testing email service...');
    const emailSent = await sendPaymentConfirmationEmail({
      parentEmail: parentEmail,
      parentName: parentName || 'Parent',
      payment: mockPayment,
      enrollmentDetails: enrollmentDetails,
    });

    if (emailSent) {
      console.log('✅ Test email sent successfully');
      res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      console.log('❌ Test email failed to send');
      res.status(500).json({ success: false, error: 'Email failed to send' });
    }
  } catch (error) {
    console.error('❌ Test email error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});


// Manual payment processing endpoint for when CartSuccess doesn't trigger
router.post('/process-recent-payment', supabaseAuth, async (req, res) => {
  try {
    console.log('🔄 Manual payment processing requested');
    
    if (!req.user?.email) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const userEmail = req.user.email;
    const { paymentIntentId } = req.body;

    console.log(`🔍 Processing recent payment for user: ${userEmail}, PI: ${paymentIntentId || 'auto-detect'}`);

    // Get the most recent payment intent for this user from Stripe
    const stripe = await getStripeClient();
    
    let targetPaymentIntent;
    if (paymentIntentId) {
      // Use specific payment intent if provided
      targetPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } else {
      // Find the most recent successful payment for this user
      const paymentIntents = await stripe.paymentIntents.list({
        limit: 10,
      });
      
      targetPaymentIntent = paymentIntents.data.find(pi => 
        pi.status === 'succeeded' && 
        pi.metadata?.parentEmail === userEmail &&
        pi.metadata?.itemsJson // Only cart payments
      );
    }

    if (!targetPaymentIntent) {
      return res.status(404).json({ error: 'No recent successful payment found' });
    }

    console.log(`💰 Found payment intent ${targetPaymentIntent.id} for processing`);

    // Process the payment using the same logic as the webhook
    const itemsJson = targetPaymentIntent.metadata.itemsJson;
    if (!itemsJson) {
      return res.status(400).json({ error: 'Payment has no enrollment items to process' });
    }

    const items = JSON.parse(itemsJson);
    console.log(`📋 Processing ${items.length} enrollment items`);

    // Calculate payment per item
    const amountAllocation = splitCentsEvenly(targetPaymentIntent.amount, items.length);
    
    // Update each enrollment
    const updatedEnrollments = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const amountPerItem = amountAllocation[index];
      try {
        // Find enrollment by child and class
        const allEnrollments = await storage.getAllEnrollments();
        const enrollment = allEnrollments.find(e => 
          e.childId === item.childId && e.classId === item.classId
        ) as any;
        
        if (enrollment) {
          const currentAmount = enrollment.totalPaid || 0;
          const newAmount = currentAmount + amountPerItem;
          const remainingBalance = Math.max(0, (enrollment.totalCost || 0) - newAmount);
          
          await storage.updateProgramEnrollment(enrollment.id, {
            totalPaid: newAmount,
            remainingBalance: remainingBalance,
            status: 'enrolled'
          });
          
          const updatedEnrollment = {
            ...enrollment,
            totalPaid: newAmount,
            remainingBalance: remainingBalance,
            status: 'enrolled' as const
          };
          updatedEnrollments.push(updatedEnrollment);
          console.log(`✅ Updated enrollment for ${item.childName} in ${item.className}: amount=${newAmount}, remaining=${remainingBalance}`);
        } else {
          console.log(`❌ Enrollment not found for ${item.childName} in ${item.className}`);
        }
      } catch (error) {
        console.error(`❌ Error updating enrollment for ${item.childName}:`, error);
      }
    }
    
    console.log(`✅ Manually processed ${updatedEnrollments.length} enrollments for payment ${targetPaymentIntent.id}`);

    res.json({
      success: true,
      message: `Successfully processed payment ${targetPaymentIntent.id}`,
      enrollmentsUpdated: updatedEnrollments.length,
      paymentAmount: targetPaymentIntent.amount / 100, // Convert to dollars
      updatedEnrollments: updatedEnrollments.map(e => ({
        childName: e.childName,
        className: e.className,
        newAmount: e.totalPaid / 100,
        remainingBalance: e.remainingBalance / 100
      }))
    });

  } catch (error) {
    console.error('❌ Error in manual payment processing:', error);
    res.status(500).json({ 
      error: 'Failed to process payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;