import Stripe from 'stripe';
import { storage } from '../storage';
import {
  getStoreCheckoutSnapshot,
  getStoreOrderByCheckoutSessionId,
  getStoreOrderByPaymentIntentId,
  markStoreSnapshotFulfilled,
  updateStoreOrder,
  createStoreOrderItem,
  getStoreProductById,
  getStoreOrderById,
} from './store-storage';
import {
  applyStorePaymentToEnrollments,
  createStoreProgramEnrollments,
  resolveStoreChild,
  type StoreChildRef,
} from './store-guest-checkout';
import { sendStorePurchaseConfirmationEmail } from './email-service';
import { resolveStoreDeliveryDocuments } from './store-documents';

export async function fulfillStoreCheckoutFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): Promise<boolean> {
  if (paymentIntent.metadata?.type !== 'store_checkout') return false;
  const snapshotId = paymentIntent.metadata.snapshotId;
  if (!snapshotId) return true;

  const existingPayment = await storage.getPaymentByStripeId(paymentIntent.id);
  if (existingPayment?.status === 'completed') {
    const order = await getStoreOrderByPaymentIntentId(paymentIntent.id);
    if (order?.status === 'paid') return true;
  }

  const sessionId = paymentIntent.metadata.checkoutSessionId ?? `pi_${paymentIntent.id}`;
  return fulfillStoreCheckoutFromWebhook({
    session: { id: sessionId, metadata: paymentIntent.metadata } as Stripe.Checkout.Session,
    paymentIntent,
  });
}
export async function fulfillStoreCheckoutFromWebhook(params: {
  session: Stripe.Checkout.Session;
  paymentIntent: Stripe.PaymentIntent;
}): Promise<boolean> {
  const meta = params.paymentIntent.metadata ?? params.session.metadata ?? {};
  if (meta.type !== 'store_checkout') return false;

  const snapshotId = meta.snapshotId as string | undefined;
  if (!snapshotId) {
    console.error('store_checkout missing snapshotId');
    return true;
  }

  const existingOrder =
    (await getStoreOrderByCheckoutSessionId(params.session.id)) ??
    (params.paymentIntent.id
      ? await getStoreOrderByPaymentIntentId(params.paymentIntent.id)
      : null);
  if (existingOrder?.status === 'paid') {
    console.log('↩️ Store order already fulfilled:', existingOrder.id);
    return true;
  }

  const existingPayment = await storage.getPaymentByStripeId(params.paymentIntent.id);
  if (
    existingPayment &&
    (existingPayment.status === 'completed')
  ) {
    console.log('↩️ Store payment already recorded:', params.paymentIntent.id);
    return true;
  }

  const snapshot = await getStoreCheckoutSnapshot(snapshotId);
  if (!snapshot) {
    console.error('Store snapshot not found:', snapshotId);
    return true;
  }

  const payload = snapshot.payload as any;
  const lines = payload.lines ?? [];
  const childAssignments = payload.childAssignments ?? [];

  const childByLineId = new Map<string, StoreChildRef>();
  for (const assignment of childAssignments) {
    if (assignment.childId && assignment.firstName) {
      childByLineId.set(assignment.lineId, {
        childId: assignment.childId,
        firstName: assignment.firstName,
        lastName: assignment.lastName,
      });
    }
  }

  let storeOrder = existingOrder;
  if (!storeOrder && meta.storeOrderId) {
    storeOrder = await getStoreOrderById(Number(meta.storeOrderId));
  }
  if (!storeOrder && payload.pendingStoreOrderId) {
    storeOrder = await getStoreOrderById(payload.pendingStoreOrderId);
  }
  if (storeOrder) {
    storeOrder = await updateStoreOrder(storeOrder.id, {
      status: 'paid',
      totalCents: params.paymentIntent.amount,
      stripeCheckoutSessionId: params.session.id,
      stripePaymentIntentId: params.paymentIntent.id,
    });
  } else {
    console.error('Store order missing for snapshot', snapshotId);
    return true;
  }

  const paidProgramLines = lines.filter(
    (l: any) => l.listingType !== 'product' && l.fulfillment === 'paid',
  );
  const waitlistLines = lines.filter(
    (l: any) => l.listingType !== 'product' && l.fulfillment === 'waitlist',
  );

  const { created: waitlistCreated } = await createStoreProgramEnrollments({
    schoolId: snapshot.schoolId,
    parentId: payload.parentId,
    parentEmail: snapshot.parentEmail ?? payload.parentEmail,
    lines: waitlistLines,
    childByLineId,
    storeOrderId: storeOrder.id,
    checkoutSessionId: params.session.id,
  });

  const { created: paidCreated } = await createStoreProgramEnrollments({
    schoolId: snapshot.schoolId,
    parentId: payload.parentId,
    parentEmail: snapshot.parentEmail ?? payload.parentEmail,
    lines: paidProgramLines,
    childByLineId,
    storeOrderId: storeOrder.id,
    checkoutSessionId: params.session.id,
  });

  const paidEnrollmentIds = paidCreated.map((c) => c.enrollmentId);
  const programPaidCents = paidProgramLines.reduce(
    (sum: number, l: any) => sum + (l.lineTotalCents ?? 0),
    0,
  );
  if (paidEnrollmentIds.length > 0 && programPaidCents > 0) {
    await applyStorePaymentToEnrollments({
      enrollmentIds: paidEnrollmentIds,
      paymentIntentId: params.paymentIntent.id,
      totalPaidCents: programPaidCents,
    });
  }

  for (const line of lines.filter((l: any) => l.listingType === 'product')) {
    const product = await getStoreProductById(line.sourceId);
    if (product?.inventoryQty != null) {
      const { updateStoreProduct } = await import('./store-storage');
      await updateStoreProduct(product.id, {
        inventoryQty: Math.max(0, product.inventoryQty - (line.quantity ?? 1)),
      });
    }
    await createStoreOrderItem({
      storeOrderId: storeOrder.id,
      listingId: line.listingId,
      productId: line.sourceId,
      name: line.title,
      quantity: line.quantity ?? 1,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      metadata: {},
    });
  }

  const parentUser = await storage.getUserByEmail(snapshot.parentEmail ?? payload.parentEmail);
  await storage.createPayment({
    schoolId: snapshot.schoolId,
    parentId: parentUser?.id ?? payload.parentId ?? null,
    parentEmail: snapshot.parentEmail ?? payload.parentEmail,
    childName: childAssignments[0]?.firstName ?? 'Store purchase',
    className: 'Public store order',
    description: `Public store checkout ${storeOrder.id}`,
    amount: params.paymentIntent.amount,
    currency: params.paymentIntent.currency ?? 'usd',
    status: 'completed',
    stripePaymentIntentId: params.paymentIntent.id,
    stripeChargeId: null,
    stripeRefundId: null,
    originalPaymentId: null,
    enrollmentIds: [...paidCreated, ...waitlistCreated].map((c) => c.enrollmentId),
    metadata: {
      storeOrderId: storeOrder.id,
      checkoutSessionId: params.session.id,
      type: 'store_checkout',
    },
    paymentDate: new Date(),
  } as any);

  await markStoreSnapshotFulfilled(snapshotId, {
    stripeCheckoutSessionId: params.session.id,
    storeOrderId: storeOrder.id,
  });

  try {
    const docs = await resolveStoreDeliveryDocuments(snapshot.schoolId, paidProgramLines);
    await sendStorePurchaseConfirmationEmail({
      to: snapshot.parentEmail ?? payload.parentEmail,
      parentName: snapshot.parentName ?? payload.parentName ?? 'Parent',
      schoolId: snapshot.schoolId,
      storeOrderId: storeOrder.id,
      accessToken: storeOrder.accessToken,
      paidLines: paidCreated,
      waitlistLines: waitlistCreated,
      merchLines: lines.filter((l: any) => l.listingType === 'product'),
      documents: docs,
    });
  } catch (emailErr) {
    console.error('Store confirmation email failed (non-fatal):', emailErr);
  }

  return true;
}

export async function fulfillStoreCheckoutWithoutPayment(snapshotId: string) {
  const snapshot = await getStoreCheckoutSnapshot(snapshotId);
  if (!snapshot || snapshot.fulfilledAt) return null;

  const payload = snapshot.payload as any;
  const lines = payload.lines ?? [];
  const childAssignments = payload.childAssignments ?? [];
  const childByLineId = new Map<string, StoreChildRef>();
  for (const assignment of childAssignments) {
    childByLineId.set(assignment.lineId, {
      childId: assignment.childId,
      firstName: assignment.firstName,
      lastName: assignment.lastName,
    });
  }

  const waitlistLines = lines.filter(
    (l: any) => l.listingType !== 'product' && l.fulfillment === 'waitlist',
  );

  const { created } = await createStoreProgramEnrollments({
    schoolId: snapshot.schoolId,
    parentId: payload.parentId,
    parentEmail: snapshot.parentEmail ?? payload.parentEmail,
    lines: waitlistLines,
    childByLineId,
    storeOrderId: payload.pendingStoreOrderId,
  });

  await markStoreSnapshotFulfilled(snapshotId, {
    storeOrderId: payload.pendingStoreOrderId,
  });

  return { created, accessToken: payload.accessToken };
}
