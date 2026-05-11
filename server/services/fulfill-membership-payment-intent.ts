import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { users } from '../../shared/schema';
import { generateMemberId } from '../utils/membership';

/**
 * Creates member id + membership enrollment when PaymentIntent metadata includes
 * hasMembership (same rules as legacy /api/stripe-webhooks handler).
 * Safe to call on the verified /api/stripe/webhook path; errors are logged, not thrown.
 */
export async function fulfillMembershipFromCartPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'customer' | 'metadata'>
): Promise<void> {
  const md = paymentIntent.metadata || {};
  const hasMembership = md.hasMembership === 'true';
  const membershipSchoolId = md.membershipSchoolId ? parseInt(md.membershipSchoolId, 10) : null;
  const membershipAmount = md.membershipAmount ? parseInt(md.membershipAmount, 10) : 0;
  const membershipYear = md.membershipYear ? parseInt(md.membershipYear, 10) : new Date().getFullYear();
  const parentUserId = md.membershipParentUserId ? parseInt(md.membershipParentUserId, 10) : null;
  const parentEmail = md.parentEmail || '';

  const membershipDiscountId = md.membershipDiscountId ? parseInt(md.membershipDiscountId, 10) : null;
  const membershipDiscountName = md.membershipDiscountName || null;
  const membershipOriginalAmount = md.membershipOriginalAmount ? parseInt(md.membershipOriginalAmount, 10) : null;
  const membershipDiscountAmount = md.membershipDiscountAmount ? parseInt(md.membershipDiscountAmount, 10) : 0;

  if (!hasMembership || !parentUserId || !membershipSchoolId) {
    return;
  }

  console.log('🎫 Processing membership payment:', {
    parentUserId,
    membershipSchoolId,
    membershipAmount,
    membershipYear,
  });

  try {
    const db = await getDb();

    const existingUser = await db.select().from(users).where(eq(users.id, parentUserId)).limit(1);

    if (existingUser.length > 0 && !existingUser[0].memberId) {
      const newMemberId = generateMemberId();

      await db.update(users).set({ memberId: newMemberId }).where(eq(users.id, parentUserId));

      console.log(`🎫 ✅ Generated Member ID ${newMemberId} for user ${parentUserId}`);

      const startDate = new Date();
      const expirationDate = new Date(startDate);
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      await storage.createMembershipEnrollment({
        schoolId: membershipSchoolId,
        parentUserId,
        membershipYear,
        membershipTier: 'basic',
        amount: membershipAmount,
        amountPaid: membershipAmount,
        remainingBalance: 0,
        status: 'enrolled',
        stripeSubscriptionId: null,
        stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null,
        startDate,
        renewalDate: expirationDate,
        dueDate: startDate,
        expirationDate,
        gracePeriodEnd: null,
        paymentMethod: 'other',
        notes: `Stripe payment via cart checkout (${paymentIntent.id})${
          membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''
        }`,
      });

      console.log(`🎫 ✅ Created membership enrollment for user ${parentUserId}`);

      if (membershipDiscountId && membershipDiscountAmount > 0 && membershipSchoolId) {
        try {
          const schoolDiscounts = await storage.getDiscountsBySchoolId(membershipSchoolId);
          const discount = schoolDiscounts.find((d) => d.id === membershipDiscountId);

          if (!discount) {
            console.error(
              `⚠️ Discount ${membershipDiscountId} not found for school ${membershipSchoolId} - skipping tracking`
            );
          } else {
            const incrementSuccess = await storage.incrementDiscountUsageAtomic(membershipDiscountId);

            if (!incrementSuccess) {
              console.log(
                `⚠️ Discount ${membershipDiscountName} has reached usage limit - atomic increment failed, skipping discount application record`
              );
            } else {
              await storage.createDiscountApplication({
                discountId: membershipDiscountId,
                parentEmail,
                childId: null,
                schoolEnrollmentId: null,
                programEnrollmentId: null,
                paymentId: paymentIntent.id,
                classId: null,
                originalAmount: membershipOriginalAmount || membershipAmount + membershipDiscountAmount,
                discountAmount: membershipDiscountAmount,
                finalAmount: membershipAmount,
                applicationMethod: 'automatic',
                appliedBy: null,
              });
              console.log(`🎫 ✅ Tracked membership discount usage: ${membershipDiscountName} (atomic increment succeeded)`);
            }
          }
        } catch (discountTrackError) {
          console.error('⚠️ Error tracking membership discount application:', discountTrackError);
        }
      }
    } else if (existingUser.length > 0 && existingUser[0].memberId) {
      console.log(`🎫 User ${parentUserId} already has Member ID: ${existingUser[0].memberId}`);
    }
  } catch (membershipError) {
    console.error('❌ Error processing membership payment:', membershipError);
  }
}
