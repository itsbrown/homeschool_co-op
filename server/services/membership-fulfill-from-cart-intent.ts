import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { storage } from '../storage';
import { users } from '../../shared/schema';
import { generateMemberId } from '../utils/membership';

/**
 * Apply membership enrollment create/update when a cart PaymentIntent includes
 * membership metadata (hasMembership, membershipSchoolId, etc.).
 * Idempotent for webhook retries. Errors are logged, not thrown.
 *
 * Shared by the verified Stripe webhook path and legacy direct-payment handler.
 */
export async function applyMembershipFulfillmentFromCartPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'customer' | 'metadata'>,
): Promise<void> {
  const md = paymentIntent.metadata || {};
  const hasMembership = md.hasMembership === 'true';
  const membershipSchoolId = md.membershipSchoolId ? parseInt(md.membershipSchoolId, 10) : null;
  const membershipAmount = md.membershipAmount ? parseInt(md.membershipAmount, 10) : 0;
  const membershipYear = md.membershipYear ? parseInt(md.membershipYear, 10) : new Date().getFullYear();
  const parentUserId = md.membershipParentUserId ? parseInt(md.membershipParentUserId, 10) : null;
  const parentEmail = (md.parentEmail as string) || '';

  const membershipDiscountId = md.membershipDiscountId ? parseInt(md.membershipDiscountId, 10) : null;
  const membershipDiscountName = (md.membershipDiscountName as string) || null;
  const membershipOriginalAmount = md.membershipOriginalAmount
    ? parseInt(md.membershipOriginalAmount, 10)
    : null;
  const membershipDiscountAmount = md.membershipDiscountAmount
    ? parseInt(md.membershipDiscountAmount, 10)
    : 0;

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
    } else if (existingUser.length > 0 && existingUser[0].memberId) {
      console.log(`🎫 User ${parentUserId} already has Member ID: ${existingUser[0].memberId}`);
    }

    const existingEnrollment = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
      parentUserId,
      membershipSchoolId,
      membershipYear,
    );

    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    if (existingEnrollment) {
      if (existingEnrollment.status === 'pending_payment') {
        await storage.updateMembershipEnrollment(existingEnrollment.id, {
          status: 'enrolled',
          amountPaid: membershipAmount,
          remainingBalance: 0,
          totalAmount: membershipAmount,
          balanceDue: 0,
          stripeCustomerId: (paymentIntent.customer as string) || null,
          startDate,
          renewalDate: expirationDate,
          endDate: expirationDate,
          expirationDate,
          paymentMethod: 'other',
          notes: `Stripe payment via cart checkout (${paymentIntent.id})${
            membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''
          }`,
        });
        console.log(
          `🎫 ✅ Updated existing pending_payment membership enrollment ${existingEnrollment.id} to enrolled for user ${parentUserId}`,
        );
      } else if (existingEnrollment.status === 'enrolled') {
        console.log(
          `🎫 Membership enrollment ${existingEnrollment.id} already enrolled for user ${parentUserId} - skipping (idempotent)`,
        );
      } else {
        await storage.updateMembershipEnrollment(existingEnrollment.id, {
          status: 'enrolled',
          amountPaid: membershipAmount,
          remainingBalance: 0,
          totalAmount: membershipAmount,
          balanceDue: 0,
          stripeCustomerId: (paymentIntent.customer as string) || null,
          startDate,
          renewalDate: expirationDate,
          endDate: expirationDate,
          expirationDate,
          paymentMethod: 'other',
          notes: `Stripe payment via cart checkout (${paymentIntent.id})${
            membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''
          }`,
        });
        console.log(
          `🎫 ✅ Updated membership enrollment ${existingEnrollment.id} from ${existingEnrollment.status} to enrolled for user ${parentUserId}`,
        );
      }
    } else {
      await storage.createMembershipEnrollment({
        schoolId: membershipSchoolId,
        parentUserId,
        membershipYear,
        membershipTier: 'basic',
        amount: membershipAmount,
        amountPaid: membershipAmount,
        remainingBalance: 0,
        totalAmount: membershipAmount,
        balanceDue: 0,
        status: 'enrolled',
        stripeSubscriptionId: null,
        stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null,
        startDate,
        renewalDate: expirationDate,
        dueDate: startDate,
        endDate: expirationDate,
        expirationDate,
        gracePeriodEnd: null,
        paymentMethod: 'other',
        notes: `Stripe payment via cart checkout (${paymentIntent.id})${
          membershipDiscountName ? ` - Discount: ${membershipDiscountName}` : ''
        }`,
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
              originalAmount: membershipOriginalAmount || membershipAmount + membershipDiscountAmount,
              discountAmount: membershipDiscountAmount,
              finalAmount: membershipAmount,
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
  } catch (membershipError) {
    console.error('❌ Error processing membership payment:', membershipError);
  }
}
