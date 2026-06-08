import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { users } from '../../shared/schema';
import { generateMemberId } from '../utils/membership';
import { resolveMembershipReserveForPaymentIntent } from '../lib/resolve-membership-reserve-for-payment';
import {
  readAllocationBreakdownFromPayment,
  type PaymentAllocationBreakdown,
} from '../lib/persist-payment-allocation-breakdown';

/**
 * Apply membership enrollment create/update when a cart PaymentIntent includes
 * membership metadata (hasMembership, membershipSchoolId, etc.).
 * Idempotent for webhook retries. Errors are logged, not thrown.
 *
 * Shared by the verified Stripe webhook path and legacy direct-payment handler.
 */
export async function applyMembershipFulfillmentFromCartPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'customer' | 'metadata' | 'amount'>,
): Promise<PaymentAllocationBreakdown | null> {
  const md = paymentIntent.metadata || {};
  const hasMembership = md.hasMembership === 'true';
  const membershipSchoolId = md.membershipSchoolId ? parseInt(md.membershipSchoolId, 10) : null;
  const membershipYear = md.membershipYear ? parseInt(md.membershipYear, 10) : new Date().getFullYear();
  const parentUserId = md.membershipParentUserId ? parseInt(md.membershipParentUserId, 10) : null;
  const parentEmail = (md.parentEmail as string) || '';

  const piAmount =
    typeof paymentIntent.amount === 'number' && Number.isInteger(paymentIntent.amount)
      ? paymentIntent.amount
      : 0;

  const resolved = await resolveMembershipReserveForPaymentIntent(paymentIntent);
  const cartMembershipTotalCents = resolved?.cartMembershipTotalCents ?? 0;
  const membershipPortionThisPaymentCents = resolved?.membershipPortionThisPaymentCents ?? 0;

  const membershipDiscountId = md.membershipDiscountId ? parseInt(md.membershipDiscountId, 10) : null;
  const membershipDiscountName = (md.membershipDiscountName as string) || null;
  const membershipOriginalAmount = md.membershipOriginalAmount
    ? parseInt(md.membershipOriginalAmount, 10)
    : null;
  const membershipDiscountAmount = md.membershipDiscountAmount
    ? parseInt(md.membershipDiscountAmount, 10)
    : 0;

  if (!hasMembership || !parentUserId || !membershipSchoolId || cartMembershipTotalCents <= 0) {
    return null;
  }

  if (membershipPortionThisPaymentCents <= 0) {
    console.log('🎫 Skipping membership fulfillment — no membership portion in this payment', {
      paymentIntentId: paymentIntent.id,
      piAmount,
      cartMembershipTotalCents,
    });
    return resolved
      ? {
          membershipCents: 0,
          classPoolCents: resolved.classPoolCents,
          grossCents: resolved.allocationGrossCents,
          paymentIntentId: paymentIntent.id,
        }
      : null;
  }

  const existingEnrollment = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
    parentUserId,
    membershipSchoolId,
    membershipYear,
  );

  const paymentRow = await storage.getPaymentByStripeId(paymentIntent.id);
  const persistedBreakdown = readAllocationBreakdownFromPayment(paymentRow);
  if (
    existingEnrollment?.notes?.includes(paymentIntent.id) ||
    persistedBreakdown?.paymentIntentId === paymentIntent.id
  ) {
    console.log(
      `🎫 Membership fulfillment already recorded for PI ${paymentIntent.id} — skipping (idempotent)`,
    );
    return (
      persistedBreakdown ?? {
        membershipCents: 0,
        classPoolCents: resolved?.classPoolCents ?? 0,
        grossCents: resolved?.allocationGrossCents ?? piAmount,
        paymentIntentId: paymentIntent.id,
      }
    );
  }

  const priorPaid = existingEnrollment?.amountPaid ?? 0;
  const remainingMembershipOwed = Math.max(0, cartMembershipTotalCents - priorPaid);
  const incrementCents = Math.min(membershipPortionThisPaymentCents, remainingMembershipOwed);

  if (incrementCents <= 0) {
    console.log('🎫 Skipping membership fulfillment — no remaining membership owed for this PI', {
      paymentIntentId: paymentIntent.id,
      priorPaid,
      cartMembershipTotalCents,
      membershipPortionThisPaymentCents,
    });
    return {
      membershipCents: 0,
      classPoolCents: resolved?.classPoolCents ?? 0,
      grossCents: resolved?.allocationGrossCents ?? piAmount,
      paymentIntentId: paymentIntent.id,
    };
  }

  console.log('🎫 Processing membership payment:', {
    parentUserId,
    membershipSchoolId,
    cartMembershipTotalCents,
    membershipPortionThisPaymentCents,
    incrementCents,
    membershipYear,
  });

  try {
    const db = await getDb();

    const existingUser = await db.select().from(users).where(eq(users.id, parentUserId)).limit(1);

    if (existingUser.length > 0 && !existingUser[0].memberId) {
      const newMemberId = generateMemberId();
      await db.update(users).set({ memberId: newMemberId }).where(eq(users.id, parentUserId));
      console.log(`🎫 ✅ Generated Member ID ${newMemberId} for user ${parentUserId}`);
    } else if (existingUser.length > 0 && existingUser[0].memberId) {
      console.log(`🎫 User ${parentUserId} already has Member ID: ${existingUser[0].memberId}`);
    }

    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    const applyMembershipPayment = (
      priorAmountPaid: number,
    ): { amountPaid: number; remainingBalance: number; status: 'enrolled' | 'pending_payment' } => {
      const amountPaid = priorAmountPaid + incrementCents;
      const remainingBalance = Math.max(0, cartMembershipTotalCents - amountPaid);
      return {
        amountPaid,
        remainingBalance,
        status: remainingBalance <= 0 ? 'enrolled' : 'pending_payment',
      };
    };

    const membershipNote = `Stripe payment via cart checkout (${paymentIntent.id})${
      membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''
    }`;

    if (existingEnrollment) {
      const ledger = applyMembershipPayment(existingEnrollment.amountPaid ?? 0);
      await storage.updateMembershipEnrollment(existingEnrollment.id, {
        status: ledger.status,
        amount: cartMembershipTotalCents,
        amountPaid: ledger.amountPaid,
        remainingBalance: ledger.remainingBalance,
        totalAmount: cartMembershipTotalCents,
        balanceDue: ledger.remainingBalance,
        stripeCustomerId: (paymentIntent.customer as string) || null,
        startDate,
        renewalDate: expirationDate,
        endDate: expirationDate,
        expirationDate,
        paymentMethod: 'other',
        notes: membershipNote,
      });
      console.log(
        `🎫 ✅ Updated membership enrollment ${existingEnrollment.id} for user ${parentUserId} (paid=${ledger.amountPaid}, balance=${ledger.remainingBalance})`,
      );
    } else {
      const ledger = applyMembershipPayment(0);
      await storage.createMembershipEnrollment({
        schoolId: membershipSchoolId,
        parentUserId,
        membershipYear,
        membershipTier: 'basic',
        amount: cartMembershipTotalCents,
        amountPaid: ledger.amountPaid,
        remainingBalance: ledger.remainingBalance,
        totalAmount: cartMembershipTotalCents,
        balanceDue: ledger.remainingBalance,
        status: ledger.status,
        stripeSubscriptionId: null,
        stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null,
        startDate,
        renewalDate: expirationDate,
        dueDate: startDate,
        endDate: expirationDate,
        expirationDate,
        gracePeriodEnd: null,
        paymentMethod: 'other',
        notes: membershipNote,
      });
      console.log(`🎫 ✅ Created new membership enrollment for user ${parentUserId}`);
    }

    if (membershipDiscountId && membershipDiscountAmount > 0 && membershipSchoolId) {
      try {
        const schoolDiscounts = await storage.getDiscountsBySchoolId(membershipSchoolId);
        const discount = schoolDiscounts.find((d) => d.id === membershipDiscountId);

        if (!discount) {
          console.error(
            `⚠️ Discount ${membershipDiscountId} not found for school ${membershipSchoolId} - skipping tracking`,
          );
        } else {
          const incrementSuccess = await storage.incrementDiscountUsageAtomic(membershipDiscountId);

          if (!incrementSuccess) {
            console.log(
              `⚠️ Discount ${membershipDiscountName} has reached usage limit - atomic increment failed`,
            );
          } else {
            await storage.createDiscountApplication({
              discountId: membershipDiscountId,
              parentEmail,
              childId: null,
              schoolEnrollmentId: null,
              programEnrollmentId: null,
              paymentId: null,
              classId: null,
              originalAmount: membershipOriginalAmount || cartMembershipTotalCents + membershipDiscountAmount,
              discountAmount: membershipDiscountAmount,
              finalAmount: cartMembershipTotalCents,
              applicationMethod: 'automatic',
              appliedBy: null,
            });
            console.log(`🎫 ✅ Tracked membership discount usage: ${membershipDiscountName}`);
          }
        }
      } catch (discountTrackError) {
        console.error('⚠️ Error tracking membership discount application:', discountTrackError);
      }
    }
    return {
      membershipCents: incrementCents,
      classPoolCents: resolved?.classPoolCents ?? 0,
      grossCents: resolved?.allocationGrossCents ?? piAmount,
      paymentIntentId: paymentIntent.id,
    };
  } catch (membershipError) {
    console.error('❌ Error processing membership payment:', membershipError);
    return null;
  }
}
