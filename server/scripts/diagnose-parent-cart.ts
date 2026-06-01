/**
 * Diagnose cart pricing / snapshot for a parent (prod-safe read + server calculate).
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/diagnose-parent-cart.ts --email parent@example.com
 */

import { storage } from '../storage';
import { filterEnrollmentsToCartLineItems } from '../../client/src/utils/parentEnrollmentLineItems';
import { enrollmentShouldExcludeFromCart } from '@shared/enrollment-cart-eligibility';
import {
  calculateCartPricing,
  calculateCartSnapshot,
  type CartItem,
} from '../utils/cart-pricing';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';

function parseArgs() {
  const emailIdx = process.argv.indexOf('--email');
  const email = emailIdx >= 0 ? process.argv[emailIdx + 1] : '';
  if (!email) {
    console.error('Usage: npx tsx server/scripts/diagnose-parent-cart.ts --email parent@example.com');
    process.exit(2);
  }
  return { email };
}

async function main() {
  const { email } = parseArgs();
  const user = await storage.getUserByEmail(email);
  if (!user) {
    console.error('User not found:', email);
    process.exit(1);
  }

  const all = await storage.getAllEnrollments();
  const parentEnrollments = all.filter(
    (e: any) =>
      String(e.parentEmail || '').toLowerCase() === email.toLowerCase() ||
      e.parentId === user.id,
  );
  const scheduled = await storage.getScheduledPaymentsByParentEmail(email);

  console.log('\n=== Enrollments ===');
  for (const e of parentEnrollments.sort((a: any, b: any) => a.id - b.id)) {
    const eff =
      typeof e.effectiveBalance === 'number'
        ? e.effectiveBalance
        : resolveEnrollmentEffectiveBalance(e);
    const excluded = enrollmentShouldExcludeFromCart(e, scheduled);
    console.log({
      id: e.id,
      child: e.childName,
      class: e.className,
      classId: e.classId,
      status: e.status,
      paymentStatus: e.paymentStatus,
      plan: e.paymentPlan,
      totalCost: e.totalCost,
      totalPaid: e.totalPaid,
      comp: e.compAmountCents,
      eff,
      excluded,
    });
  }

  const lineItems = filterEnrollmentsToCartLineItems(
    parentEnrollments.map((e: any) => ({
      ...e,
      effectiveBalance: resolveEnrollmentEffectiveBalance(e),
      checkoutExcluded: enrollmentShouldExcludeFromCart(e, scheduled),
    })),
  );

  console.log('\n=== Cart line items (client filter) ===');
  for (const e of lineItems) {
    console.log({
      id: e.id,
      child: e.childName,
      class: e.className,
      classId: e.classId ?? e.marketplaceClassId,
      eff: resolveEnrollmentEffectiveBalance(e),
    });
  }

  const cartItems: CartItem[] = lineItems.map((e: any) => {
    const remaining = resolveEnrollmentEffectiveBalance(e);
    return {
      id: `enrollment-${e.id}`,
      classId: e.marketplaceClassId || e.classId,
      childId: e.childId,
      childName: e.childName,
      variantId: e.variantId,
      enrollmentId: e.id,
      remainingBalance: remaining,
    };
  });

  if (cartItems.length === 0) {
    console.log('\nNo cart items — parent may see empty cart at checkout.');
    return;
  }

  const schoolId = user.schoolId ?? 2;
  console.log('\n=== calculateCartPricing ===');
  try {
    const pricing = await calculateCartPricing(cartItems, user.id, schoolId);
    console.log({
      subtotal: pricing.subtotal,
      total: pricing.total,
      itemPrices: pricing.itemPrices,
    });
  } catch (err: any) {
    console.error('calculateCartPricing FAILED:', err?.message ?? err);
  }

  console.log('\n=== calculateCartSnapshot ===');
  try {
    const snap = await calculateCartSnapshot(
      cartItems,
      user.id,
      schoolId,
      undefined,
      0,
      email,
    );
    console.log({
      snapshotId: snap.snapshotId,
      itemsTotal: snap.totals.itemsTotal,
      membershipTotal: snap.totals.membershipTotal,
      grandTotal: snap.totals.grandTotal,
      payableAmount: snap.totals.payableAmount,
      membership: snap.membership,
    });
  } catch (err: any) {
    console.error('calculateCartSnapshot FAILED:', err?.message ?? err);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
