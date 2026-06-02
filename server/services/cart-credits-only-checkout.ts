import crypto from 'crypto';
import { computeEffectiveBalance } from '@shared/schema';
import { storage } from '../storage';
import type { CanonicalAmountCalculationResult } from './canonical-amount-calculator';
import { generateMemberId } from '../utils/membership';
import { allocateVolunteerCreditsWaterfall } from '../lib/balance-payment-metadata';

export type ServerMembershipForCheckout = {
  parentUserId: number;
  schoolId: number;
  amount: number;
  year: number;
  discountId?: number;
  discountName?: string;
  originalAmount?: number;
  discountAmount?: number;
};

function buildSyntheticStripeId(params: {
  parentId: number;
  enrollmentIds: number[];
  totalWithMembership: number;
  appliedCents: number;
  membershipYear: number;
}): string {
  const key = [
    params.parentId,
    [...params.enrollmentIds].sort((a, b) => a - b).join(','),
    params.totalWithMembership,
    params.appliedCents,
    params.membershipYear,
  ].join('|');
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  return `credit_only_cart_${hash}`;
}

async function applyCreditCentsToEnrollment(
  enrollmentId: number,
  creditCents: number,
): Promise<number> {
  if (creditCents <= 0) return 0;
  const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
  if (!enrollment) return 0;

  const compAmount = enrollment.compAmountCents ?? 0;
  const owedBefore = computeEffectiveBalance(
    enrollment.totalCost ?? 0,
    enrollment.totalPaid ?? 0,
    compAmount,
  );
  const toApply = Math.min(creditCents, owedBefore);
  if (toApply <= 0) return 0;

  const newPaid = (enrollment.totalPaid ?? 0) + toApply;
  const newBalance = Math.max(0, (enrollment.totalCost ?? 0) - newPaid - compAmount);
  await storage.updateProgramEnrollment(enrollmentId, {
    totalPaid: newPaid,
    remainingBalance: newBalance,
    paymentStatus: newBalance <= 0 ? 'completed' : 'deposit_paid',
    status: 'enrolled',
  });
  await syncScheduledPaymentsForEnrollment(enrollmentId, newPaid);
  return toApply;
}

async function syncScheduledPaymentsForEnrollment(enrollmentId: number, newTotalPaid: number): Promise<void> {
  const enrollmentScheduledPayments = await storage.getScheduledPaymentsByEnrollmentId(enrollmentId);
  const sortedPayments = enrollmentScheduledPayments.sort((a, b) => {
    const dateCompare = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
    return dateCompare !== 0 ? dateCompare : (a.installmentNumber || 0) - (b.installmentNumber || 0);
  });
  let cumulativeAmount = 0;
  for (const sp of sortedPayments) {
    if (sp.status === 'cancelled' || sp.status === 'skipped') continue;
    cumulativeAmount += sp.amount;
    if (sp.status === 'completed') continue;
    if (cumulativeAmount <= newTotalPaid) {
      await storage.updateScheduledPayment(sp.id, {
        status: 'completed',
        processedAt: new Date(),
        completionSource: 'cart_credits_only',
      });
    } else {
      break;
    }
  }
}

async function fulfillMembershipCreditsOnly(
  parentUserId: number,
  parentEmail: string,
  m: ServerMembershipForCheckout,
  referenceNote: string,
  creditCentsApplied: number,
): Promise<void> {
  if (creditCentsApplied <= 0) {
    return;
  }
  const user = await storage.getUser(parentUserId);
  if (!user) return;

  if (!user.memberId) {
    const newMemberId = generateMemberId();
    await storage.updateUser(parentUserId, { memberId: newMemberId });
  }

  const existingEnrollment = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
    parentUserId,
    m.schoolId,
    m.year,
  );

  const startDate = new Date();
  const expirationDate = new Date(startDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  const notes = `Credits-only cart checkout (${referenceNote})${m.discountName ? ` - Discount: ${m.discountName}` : ''}`;

  const priorPaid = existingEnrollment?.amountPaid ?? 0;
  const newPaid = Math.min(m.amount, priorPaid + creditCentsApplied);
  const newRemaining = Math.max(0, m.amount - newPaid);
  const newStatus = newRemaining <= 0 ? 'enrolled' : 'pending_payment';

  if (existingEnrollment) {
    if (
      existingEnrollment.status === 'enrolled' &&
      (existingEnrollment.amountPaid ?? 0) >= m.amount
    ) {
      return;
    }
    await storage.updateMembershipEnrollment(existingEnrollment.id, {
      status: newStatus,
      amountPaid: newPaid,
      remainingBalance: newRemaining,
      totalAmount: m.amount,
      balanceDue: newRemaining,
      stripeCustomerId: user.stripeCustomerId || null,
      startDate,
      renewalDate: expirationDate,
      endDate: expirationDate,
      expirationDate,
      paymentMethod: 'other',
      notes,
    });
  } else {
    await storage.createMembershipEnrollment({
      schoolId: m.schoolId,
      parentUserId,
      membershipYear: m.year,
      membershipTier: 'basic',
      amount: m.amount,
      amountPaid: newPaid,
      remainingBalance: newRemaining,
      totalAmount: m.amount,
      balanceDue: newRemaining,
      status: newStatus,
      stripeSubscriptionId: null,
      stripeCustomerId: user.stripeCustomerId || null,
      startDate,
      renewalDate: expirationDate,
      dueDate: startDate,
      endDate: expirationDate,
      expirationDate,
      gracePeriodEnd: null,
      paymentMethod: 'other',
      notes,
    });
  }

  if (m.discountId && (m.discountAmount || 0) > 0 && m.schoolId) {
    try {
      const schoolDiscounts = await storage.getDiscountsBySchoolId(m.schoolId);
      const discount = schoolDiscounts.find((d) => d.id === m.discountId);
      if (!discount) return;
      const incrementSuccess = await storage.incrementDiscountUsageAtomic(m.discountId);
      if (!incrementSuccess) return;
      await storage.createDiscountApplication({
        discountId: m.discountId,
        parentEmail,
        childId: null,
        schoolEnrollmentId: null,
        programEnrollmentId: null,
        paymentId: null,
        classId: null,
        originalAmount: m.originalAmount || m.amount + (m.discountAmount || 0),
        discountAmount: m.discountAmount || 0,
        finalAmount: m.amount,
        applicationMethod: 'automatic',
        appliedBy: null,
      });
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * When the cart total is fully covered by volunteer credits (no card charge),
 * reserve and finalize credits, update enrollments + membership, and record a payment row.
 */
export async function completeCartCreditsOnlyCheckout(params: {
  parentEmail: string;
  parentId: number;
  parentSchoolId: number | null;
  enrollmentIds: number[];
  authoritativeAmountResult: CanonicalAmountCalculationResult;
  appliedVolunteerCreditsCents: number;
  totalWithMembership: number;
  serverMembership?: ServerMembershipForCheckout;
}): Promise<{ creditsApplied: number; syntheticPaymentIntentId: string }> {
  const {
    parentEmail,
    parentId,
    parentSchoolId,
    enrollmentIds,
    authoritativeAmountResult,
    appliedVolunteerCreditsCents,
    totalWithMembership,
    serverMembership,
  } = params;

  if (appliedVolunteerCreditsCents !== totalWithMembership || totalWithMembership <= 0) {
    throw new Error('CREDITS_ONLY_INVARIANT');
  }

  const membershipYear = serverMembership?.year ?? new Date().getFullYear();
  const syntheticPaymentIntentId = buildSyntheticStripeId({
    parentId,
    enrollmentIds,
    totalWithMembership,
    appliedCents: appliedVolunteerCreditsCents,
    membershipYear,
  });

  const existing = await storage.getPaymentByStripeId(syntheticPaymentIntentId);

  const holdSessionId = `cart_credits_${syntheticPaymentIntentId}`;
  let holdCreated = false;

  try {
    const breakdown = authoritativeAmountResult.breakdown;
    const schoolIdFromEnrollment =
      enrollmentIds.length > 0
        ? (await storage.getProgramEnrollmentById(enrollmentIds[0]!))?.schoolId
        : null;
    const schoolId = parentSchoolId ?? schoolIdFromEnrollment ?? 1;

    let membershipOwedCents = 0;
    if (serverMembership) {
      const existingMe = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
        serverMembership.parentUserId,
        serverMembership.schoolId,
        serverMembership.year,
      );
      membershipOwedCents = Math.max(
        0,
        serverMembership.amount - (existingMe?.amountPaid ?? 0),
      );
    }

    const creditSplit = allocateVolunteerCreditsWaterfall({
      creditsCents: appliedVolunteerCreditsCents,
      membershipOwedCents,
    });

    if (!existing) {
      const { totalHeld } = await storage.createCreditHolds(
        parentId,
        appliedVolunteerCreditsCents,
        holdSessionId,
        `Cart checkout credits-only (${syntheticPaymentIntentId})`,
        60,
      );
      if (totalHeld < appliedVolunteerCreditsCents) {
        throw new Error(`INSUFFICIENT_CREDIT_HOLD: need ${appliedVolunteerCreditsCents}, held ${totalHeld}`);
      }
      holdCreated = true;
    }

    const createdPayment =
      existing ??
      (await storage.createPayment({
      schoolId,
      parentId,
      parentEmail,
      childName: 'Cart checkout',
      className: enrollmentIds.length > 1 ? `${enrollmentIds.length} classes` : 'Class',
      description: `Credits-only checkout — volunteer credits applied`,
      amount: 0,
      currency: 'usd',
      status: 'completed',
      stripePaymentIntentId: syntheticPaymentIntentId,
      stripeChargeId: null,
      stripeRefundId: null,
      originalPaymentId: null,
      enrollmentIds,
      paymentMethod: 'other',
      metadata: {
        creditOnlyCheckout: true,
        creditsAppliedCents: appliedVolunteerCreditsCents,
        totalWithMembershipCents: totalWithMembership,
        creditAllocation: creditSplit,
        allocationBreakdown: {
          membershipCents: creditSplit.membershipCredits,
          classPoolCents: creditSplit.enrollmentCredits,
          grossCents: appliedVolunteerCreditsCents,
        },
      },
      paymentDate: new Date(),
    }));

    if (!existing) {
      await storage.finalizeCreditHolds(
        holdSessionId,
        createdPayment.id,
        `Cart credits-only checkout payment #${createdPayment.id}`,
      );
    }

    if (serverMembership && creditSplit.membershipCredits > 0) {
      await fulfillMembershipCreditsOnly(
        serverMembership.parentUserId,
        parentEmail,
        serverMembership,
        syntheticPaymentIntentId,
        creditSplit.membershipCredits,
      );
    }

    let enrollmentCreditPool = creditSplit.enrollmentCredits;
    for (const line of breakdown) {
      const enrollmentId = parseInt(line.id, 10);
      if (!Number.isFinite(enrollmentId) || enrollmentCreditPool <= 0) continue;
      const lineCap = line.selectedChargeCents;
      const creditCents = Math.min(lineCap, enrollmentCreditPool);
      const applied = await applyCreditCentsToEnrollment(enrollmentId, creditCents);
      enrollmentCreditPool -= applied;
    }

    // Apply any remaining class credits (breakdown line caps can be 0 when ids diverge from enrollmentIds).
    for (const enrollmentId of enrollmentIds) {
      if (enrollmentCreditPool <= 0) break;
      const applied = await applyCreditCentsToEnrollment(enrollmentId, enrollmentCreditPool);
      enrollmentCreditPool -= applied;
    }

    try {
      const { dataLayer } = await import('./dataLayer.js');
      await dataLayer.refreshUserData(parentEmail);
    } catch {
      /* non-fatal */
    }

    return { creditsApplied: appliedVolunteerCreditsCents, syntheticPaymentIntentId };
  } catch (err) {
    if (holdCreated) {
      try {
        await storage.releaseCreditHolds(holdSessionId);
      } catch {
        /* best-effort */
      }
    }
    throw err;
  }
}
