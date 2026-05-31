import { getDb } from '../db';
import {
  auditLogs,
  children,
  locations,
  programEnrollments,
  sessions,
  users,
} from '@shared/schema';
import { and, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import {
  countEligibleActivationStudents,
  getLocationCore,
  updateLocationActivationFields,
} from '../lib/location-db';
import { isLegacyActiveLocation, isLocationCollectingWishlist } from '@shared/location-activation';
import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';

async function ensureStripeCustomer(userId: number): Promise<string> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error('User not found');
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const stripe = await getStripeClient();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: String(userId) },
  });
  await storage.updateUser(userId, { stripeCustomerId: customer.id });
  return customer.id;
}
import { fulfillBalancePaymentIntent } from '../lib/fulfill-balance-payment-intent';
import {
  sendLocationActivationCancelledEmail,
  sendLocationActivationChargeFailedEmail,
  sendLocationActivationChargeSuccessEmail,
  sendLocationActivationNoticeEmail,
} from './location-activation-emails';

export async function countEligibleStudents(locationId: number): Promise<number> {
  return countEligibleActivationStudents(locationId);
}

async function getWishlistEnrollmentIdsForLocation(locationId: number): Promise<number[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: programEnrollments.id })
    .from(programEnrollments)
    .innerJoin(sessions, eq(programEnrollments.sessionId, sessions.id))
    .where(
      and(
        eq(programEnrollments.status, 'location_wishlist'),
        or(
          eq(programEnrollments.locationId, locationId),
          eq(sessions.locationId, locationId),
        ),
      ),
    );
  return rows.map((r) => r.id);
}

async function writeActivationAudit(
  actionType: string,
  actorId: number | null,
  locationId: number,
  schoolId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.insert(auditLogs).values({
    actionType,
    severity: 'info',
    actorId,
    targetType: 'location',
    targetId: String(locationId),
    schoolId,
    metadata,
  });
}

export async function recheckLocationThreshold(locationId: number): Promise<void> {
  const location = await getLocationCore(locationId);
  if (!location || isLegacyActiveLocation(location)) return;
  if (location.activationStatus !== 'collecting') return;
  if (location.activationThreshold == null) return;

  const count = await countEligibleStudents(locationId);
  if (count < location.activationThreshold) return;

  const noticeHours = location.activationNoticeHours ?? 72;
  const now = new Date();
  const chargeAt = new Date(now.getTime() + noticeHours * 60 * 60 * 1000);

  await updateLocationActivationFields(locationId, {
    activationStatus: 'notice_period',
    noticeStartedAt: now,
    chargeScheduledAt: chargeAt,
  });

  await notifyWishlistParentsOfNotice(locationId, chargeAt, location.activationThreshold, count);
}

async function notifyWishlistParentsOfNotice(
  locationId: number,
  chargeAt: Date,
  threshold: number,
  currentCount: number,
): Promise<void> {
  const db = await getDb();
  const parents = await db
    .selectDistinct({
      parentId: users.id,
      email: users.email,
      firstName: users.firstName,
    })
    .from(programEnrollments)
    .innerJoin(children, eq(programEnrollments.childId, children.id))
    .innerJoin(users, eq(children.parentId, users.id))
    .innerJoin(sessions, eq(programEnrollments.sessionId, sessions.id))
    .where(
      and(
        eq(programEnrollments.status, 'location_wishlist'),
        or(
          eq(programEnrollments.locationId, locationId),
          eq(sessions.locationId, locationId),
        ),
      ),
    );

  const location = await getLocationCore(locationId);
  for (const parent of parents) {
    if (!parent.email) continue;
    await sendLocationActivationNoticeEmail({
      email: parent.email,
      parentName: parent.firstName || 'Parent',
      locationName: location?.name ?? 'Campus',
      chargeAt,
      threshold,
      currentCount,
    });
  }
}

export async function adminActivateEarly(
  locationId: number,
  actorId: number,
  reason: string,
): Promise<{ ok: boolean; message?: string }> {
  const location = await getLocationCore(locationId);
  if (!location) return { ok: false, message: 'Location not found' };
  if (isLegacyActiveLocation(location)) {
    return { ok: false, message: 'Location has no activation threshold' };
  }
  if (location.activationStatus === 'activated') {
    return { ok: false, message: 'Location is already activated' };
  }
  if (location.activationStatus === 'cancelled') {
    return { ok: false, message: 'Location collection was cancelled' };
  }

  const noticeHours = location.activationNoticeHours ?? 72;
  const now = new Date();
  const chargeAt = new Date(now.getTime() + noticeHours * 60 * 60 * 1000);

  await updateLocationActivationFields(locationId, {
    activationStatus: 'notice_period',
    noticeStartedAt: now,
    chargeScheduledAt: chargeAt,
  });

  const count = await countEligibleStudents(locationId);
  await writeActivationAudit('location_activate_early', actorId, locationId, location.schoolId, {
    reason,
    eligibleStudentCount: count,
    threshold: location.activationThreshold,
    chargeScheduledAt: chargeAt.toISOString(),
  });

  await notifyWishlistParentsOfNotice(
    locationId,
    chargeAt,
    location.activationThreshold ?? 0,
    count,
  );

  return { ok: true };
}

export async function cancelLocationCollection(
  locationId: number,
  actorId: number | null,
  reason: string,
): Promise<void> {
  const location = await getLocationCore(locationId);
  if (!location) return;

  const db = await getDb();
  const enrollmentIds = await getWishlistEnrollmentIdsForLocation(locationId);
  if (enrollmentIds.length > 0) {
    await db
      .update(programEnrollments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(inArray(programEnrollments.id, enrollmentIds));
  }

  await updateLocationActivationFields(locationId, {
    activationStatus: 'cancelled',
  });

  await writeActivationAudit(
    actorId ? 'location_cancel_collection' : 'location_collection_expired',
    actorId,
    locationId,
    location.schoolId,
    { reason, cancelledEnrollmentIds: enrollmentIds },
  );

  const parents = await db
    .selectDistinct({ email: users.email, firstName: users.firstName })
    .from(users)
    .innerJoin(children, eq(children.parentId, users.id))
    .innerJoin(programEnrollments, eq(programEnrollments.childId, children.id))
    .where(inArray(programEnrollments.id, enrollmentIds.length ? enrollmentIds : [-1]));

  for (const parent of parents) {
    if (!parent.email) continue;
    await sendLocationActivationCancelledEmail({
      email: parent.email,
      parentName: parent.firstName || 'Parent',
      locationName: location.name,
      reason,
    });
  }
}

export async function expireCollectionsPastDeadline(): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.activationStatus, 'collecting'),
        isNotNull(locations.collectionDeadline),
        lte(locations.collectionDeadline, now),
      ),
    );

  for (const row of rows) {
    const count = await countEligibleStudents(row.id);
    const loc = await getLocationCore(row.id);
    if (!loc?.activationThreshold || count >= loc.activationThreshold) continue;
    await cancelLocationCollection(row.id, null, 'Collection deadline passed without reaching threshold');
  }
  return rows.length;
}

export async function processNoticePeriodLocations(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const due = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.activationStatus, 'notice_period'),
        isNotNull(locations.chargeScheduledAt),
        lte(locations.chargeScheduledAt, now),
      ),
    );

  for (const row of due) {
    await executeScheduledCharges(row.id);
  }
}

export async function executeScheduledCharges(locationId: number): Promise<void> {
  const location = await getLocationCore(locationId);
  if (!location) return;

  const db = await getDb();
  const wishlistRows = await db
    .select({
      enrollment: programEnrollments,
      parentId: children.parentId,
    })
    .from(programEnrollments)
    .innerJoin(children, eq(programEnrollments.childId, children.id))
    .innerJoin(sessions, eq(programEnrollments.sessionId, sessions.id))
    .where(
      and(
        eq(programEnrollments.status, 'location_wishlist'),
        or(
          eq(programEnrollments.locationId, locationId),
          eq(sessions.locationId, locationId),
        ),
      ),
    );

  const byParent = new Map<number, typeof wishlistRows>();
  for (const row of wishlistRows) {
    const pid = row.parentId;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(row);
  }

  for (const [parentId, rows] of byParent) {
    const parent = await storage.getUser(parentId);
    if (!parent?.stripeDefaultPaymentMethodId || !parent.stripeCustomerId) {
      for (const { enrollment } of rows) {
        await db
          .update(programEnrollments)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(programEnrollments.id, enrollment.id));
      }
      if (parent?.email) {
        await sendLocationActivationChargeFailedEmail({
          email: parent.email,
          parentName: parent.firstName || 'Parent',
          locationName: location.name,
          reason: 'No saved payment method on file',
        });
      }
      continue;
    }

    const enrollmentIds = rows.map((r) => r.enrollment.id);
    const totalCents = rows.reduce(
      (sum, r) => sum + (r.enrollment.remainingBalance ?? r.enrollment.totalCost ?? 0),
      0,
    );

    if (totalCents < 50) {
      console.warn(
        `[LocationActivation] Skipping parent ${parentId} — total ${totalCents}c below Stripe minimum`,
      );
      continue;
    }

    for (const id of enrollmentIds) {
      await db
        .update(programEnrollments)
        .set({ status: 'pending_payment', updatedAt: new Date() })
        .where(eq(programEnrollments.id, id));
    }

    try {
      await ensureStripeCustomer(parentId);
      const stripe = await getStripeClient();
      const intent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        customer: parent.stripeCustomerId!,
        payment_method: parent.stripeDefaultPaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          paymentType: 'location_activation',
          locationId: String(locationId),
          enrollmentIds: JSON.stringify(enrollmentIds),
          parentEmail: parent.email,
          userId: String(parentId),
        },
      });

      if (intent.status === 'succeeded') {
        await fulfillBalancePaymentIntent(intent, enrollmentIds);
        if (parent.email) {
          await sendLocationActivationChargeSuccessEmail({
            email: parent.email,
            parentName: parent.firstName || 'Parent',
            locationName: location.name,
            amountCents: totalCents,
          });
        }
      } else {
        throw new Error(`PaymentIntent status: ${intent.status}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[LocationActivation] Charge failed for parent ${parentId}:`, message);
      for (const id of enrollmentIds) {
        await db
          .update(programEnrollments)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(programEnrollments.id, id));
      }
      if (parent.email) {
        await sendLocationActivationChargeFailedEmail({
          email: parent.email,
          parentName: parent.firstName || 'Parent',
          locationName: location.name,
          reason: message,
        });
      }
    }
  }

  await updateLocationActivationFields(locationId, {
    activationStatus: 'activated',
    activatedAt: new Date(),
  });

  await db
    .update(sessions)
    .set({ enrollmentOpen: true, updatedAt: new Date() })
    .where(eq(sessions.locationId, locationId));
}

export async function recheckLocationsForParent(parentId: number): Promise<void> {
  const db = await getDb();
  const locationRows = await db
    .selectDistinct({ locationId: programEnrollments.locationId })
    .from(programEnrollments)
    .innerJoin(children, eq(programEnrollments.childId, children.id))
    .where(
      and(
        eq(children.parentId, parentId),
        eq(programEnrollments.status, 'location_wishlist'),
      ),
    );

  for (const row of locationRows) {
    if (row.locationId != null) {
      await recheckLocationThreshold(row.locationId);
    }
  }

  const sessionLocations = await db
    .selectDistinct({ locationId: sessions.locationId })
    .from(programEnrollments)
    .innerJoin(sessions, eq(programEnrollments.sessionId, sessions.id))
    .innerJoin(children, eq(programEnrollments.childId, children.id))
    .where(
      and(
        eq(children.parentId, parentId),
        eq(programEnrollments.status, 'location_wishlist'),
        sql`${sessions.location_id} IS NOT NULL`,
      ),
    );

  for (const row of sessionLocations) {
    if (row.locationId != null) {
      await recheckLocationThreshold(row.locationId);
    }
  }
}

export async function getLocationActivationProgress(locationId: number) {
  const location = await getLocationCore(locationId);
  if (!location) return null;
  const eligibleCount = await countEligibleStudents(locationId);
  return {
    locationId,
    name: location.name,
    activationStatus: location.activationStatus,
    activationThreshold: location.activationThreshold,
    eligibleStudentCount: eligibleCount,
    chargeScheduledAt: location.chargeScheduledAt,
    noticeStartedAt: location.noticeStartedAt,
    isLegacy: isLegacyActiveLocation(location),
    allowsWishlistSignup: isLocationCollectingWishlist(location),
  };
}
