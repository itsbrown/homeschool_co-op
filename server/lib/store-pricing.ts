import { and, eq, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { programEnrollments, sessions, classes } from '@shared/schema';
import { storage } from '../storage';
import {
  parentHasMemberIdForCheckout,
  resolveMembershipOwedForCheckout,
} from '../utils/cart-pricing';
import {
  getPublishedStoreListings,
  getSessionById,
  getClassById,
  getStoreProductById,
} from './store-storage';
import {
  getLocationCore,
} from '../lib/location-db';
import {
  isLocationActivationCancelled,
  isLocationInNoticePeriod,
} from '@shared/location-activation';

export type StoreCartLineType = 'product' | 'session' | 'class';

export interface StoreCartLineInput {
  lineId: string;
  listingId: number;
  listingType: StoreCartLineType;
  sourceId: number;
  quantity?: number;
  variant?: 'half_day' | 'full_day';
  childId?: number;
  childDraft?: {
    firstName: string;
    lastName: string;
    birthdate: string;
    gradeLevel: string;
  };
}

export interface StoreSnapshotLine {
  lineId: string;
  listingId: number;
  listingType: StoreCartLineType;
  sourceId: number;
  title: string;
  description?: string | null;
  variant?: 'half_day' | 'full_day';
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  membersOnly: boolean;
  fulfillment: 'paid' | 'waitlist';
  waitlistPosition?: number | null;
  childId?: number;
  childName?: string;
  unavailableReason?: string;
}

export interface StoreSnapshotResult {
  snapshotId: string;
  schoolId: number;
  lines: StoreSnapshotLine[];
  membershipTotalCents: number;
  itemsTotalCents: number;
  amountDueCents: number;
  hasMembersOnlyLine: boolean;
  membershipAlreadyPaid: boolean;
}

async function countSessionVariantEnrollments(sessionId: number, variant: string): Promise<number> {
  const db = await getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.sessionId, sessionId),
        eq(programEnrollments.variantId, variant),
        notInArray(programEnrollments.status, ['cancelled']),
      ),
    );
  return result?.count ?? 0;
}

async function countSessionWaitlist(sessionId: number, variant: string): Promise<number> {
  const db = await getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.sessionId, sessionId),
        eq(programEnrollments.variantId, variant),
        eq(programEnrollments.status, 'waitlist'),
      ),
    );
  return result?.count ?? 0;
}

async function countClassEnrollments(classId: number): Promise<number> {
  const db = await getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.marketplaceClassId, classId),
        notInArray(programEnrollments.status, ['cancelled', 'completed']),
      ),
    );
  return result?.count ?? 0;
}

async function resolveSessionLine(
  listing: { id: number; sourceId: number; membersOnly: boolean },
  variant: 'half_day' | 'full_day',
): Promise<{ title: string; description: string | null; unitPriceCents: number; fulfillment: 'paid' | 'waitlist'; waitlistPosition?: number; unavailableReason?: string } | null> {
  const session = await getSessionById(listing.sourceId);
  if (!session || !session.enrollmentOpen) {
    return null;
  }
  if (session.locationId != null) {
    const loc = await getLocationCore(session.locationId);
    if (isLocationActivationCancelled(loc)) {
      return { title: session.name, description: session.description, unitPriceCents: 0, fulfillment: 'paid', unavailableReason: 'Enrollment is closed for this campus.' };
    }
    if (isLocationInNoticePeriod(loc)) {
      return { title: session.name, description: session.description, unitPriceCents: 0, fulfillment: 'paid', unavailableReason: 'This campus is in a notice period; new enrollments are paused.' };
    }
  }
  const price =
    variant === 'half_day' ? session.halfDayPrice ?? 0 : session.fullDayPrice ?? 0;
  const capacity =
    variant === 'half_day' ? session.halfDayCapacity : session.fullDayCapacity;
  let fulfillment: 'paid' | 'waitlist' = 'paid';
  let waitlistPosition: number | undefined;
  if (capacity != null && capacity > 0) {
    const current = await countSessionVariantEnrollments(session.id, variant);
    if (current >= capacity) {
      fulfillment = 'waitlist';
      waitlistPosition = (await countSessionWaitlist(session.id, variant)) + 1;
    }
  }
  const variantLabel = variant === 'half_day' ? 'Half Day' : 'Full Day';
  return {
    title: `${session.name} — ${variantLabel}`,
    description: session.description,
    unitPriceCents: price,
    fulfillment,
    waitlistPosition,
  };
}

async function resolveClassLine(
  listing: { id: number; sourceId: number; membersOnly: boolean },
): Promise<{ title: string; description: string | null; unitPriceCents: number; fulfillment: 'paid' | 'waitlist'; waitlistPosition?: number } | null> {
  const cls = await getClassById(listing.sourceId);
  if (!cls || !cls.isPublished) {
    return null;
  }
  const price = cls.price ?? 0;
  let fulfillment: 'paid' | 'waitlist' = 'paid';
  let waitlistPosition: number | undefined;
  const capacity = cls.capacity ?? 0;
  if (capacity > 0) {
    const current = await countClassEnrollments(cls.id);
    if (current >= capacity) {
      fulfillment = 'waitlist';
      const db = await getDb();
      const [wl] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.marketplaceClassId, cls.id),
            eq(programEnrollments.status, 'waitlist'),
          ),
        );
      waitlistPosition = (wl?.count ?? 0) + 1;
    }
  }
  return {
    title: cls.title,
    description: cls.description,
    unitPriceCents: price,
    fulfillment,
    waitlistPosition,
  };
}

export async function calculateStoreSnapshot(params: {
  schoolId: number;
  cartLines: StoreCartLineInput[];
  parentUserId?: number | null;
}): Promise<StoreSnapshotResult> {
  const listings = await getPublishedStoreListings(params.schoolId);
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const snapshotLines: StoreSnapshotLine[] = [];
  let itemsTotalCents = 0;
  let hasMembersOnlyLine = false;

  for (const line of params.cartLines) {
    const listing = listingMap.get(line.listingId);
    if (!listing || listing.sourceId !== line.sourceId || listing.listingType !== line.listingType) {
      continue;
    }
    if (listing.membersOnly) hasMembersOnlyLine = true;

    const qty = Math.max(1, line.quantity ?? 1);

    if (line.listingType === 'product') {
      const product = await getStoreProductById(line.sourceId);
      if (!product || !product.isActive) continue;
      const lineTotal = product.priceCents * qty;
      itemsTotalCents += lineTotal;
      snapshotLines.push({
        lineId: line.lineId,
        listingId: listing.id,
        listingType: 'product',
        sourceId: product.id,
        title: product.name,
        description: product.description,
        quantity: qty,
        unitPriceCents: product.priceCents,
        lineTotalCents: lineTotal,
        membersOnly: listing.membersOnly,
        fulfillment: 'paid',
        childId: line.childId,
      });
      continue;
    }

    if (line.listingType === 'session') {
      const variant = line.variant ?? 'full_day';
      const resolved = await resolveSessionLine(listing, variant);
      if (!resolved) continue;
      if (resolved.unavailableReason) {
        snapshotLines.push({
          lineId: line.lineId,
          listingId: listing.id,
          listingType: 'session',
          sourceId: line.sourceId,
          title: resolved.title,
          description: resolved.description,
          variant,
          quantity: 1,
          unitPriceCents: 0,
          lineTotalCents: 0,
          membersOnly: listing.membersOnly,
          fulfillment: 'paid',
          unavailableReason: resolved.unavailableReason,
          childId: line.childId,
          childName: line.childDraft
            ? `${line.childDraft.firstName} ${line.childDraft.lastName}`
            : undefined,
        });
        continue;
      }
      const chargeable = resolved.fulfillment === 'paid';
      const lineTotal = chargeable ? resolved.unitPriceCents : 0;
      if (chargeable) itemsTotalCents += lineTotal;
      snapshotLines.push({
        lineId: line.lineId,
        listingId: listing.id,
        listingType: 'session',
        sourceId: line.sourceId,
        title: resolved.title,
        description: resolved.description,
        variant,
        quantity: 1,
        unitPriceCents: resolved.unitPriceCents,
        lineTotalCents: lineTotal,
        membersOnly: listing.membersOnly,
        fulfillment: resolved.fulfillment,
        waitlistPosition: resolved.waitlistPosition,
        childId: line.childId,
        childName: line.childDraft
          ? `${line.childDraft.firstName} ${line.childDraft.lastName}`
          : undefined,
      });
      continue;
    }

    if (line.listingType === 'class') {
      const resolved = await resolveClassLine(listing);
      if (!resolved) continue;
      const chargeable = resolved.fulfillment === 'paid';
      const lineTotal = chargeable ? resolved.unitPriceCents : 0;
      if (chargeable) itemsTotalCents += lineTotal;
      snapshotLines.push({
        lineId: line.lineId,
        listingId: listing.id,
        listingType: 'class',
        sourceId: line.sourceId,
        title: resolved.title,
        description: resolved.description,
        quantity: 1,
        unitPriceCents: resolved.unitPriceCents,
        lineTotalCents: lineTotal,
        membersOnly: listing.membersOnly,
        fulfillment: resolved.fulfillment,
        waitlistPosition: resolved.waitlistPosition,
        childId: line.childId,
        childName: line.childDraft
          ? `${line.childDraft.firstName} ${line.childDraft.lastName}`
          : undefined,
      });
    }
  }

  let membershipTotalCents = 0;
  let membershipAlreadyPaid = true;

  if (hasMembersOnlyLine && params.parentUserId) {
    const user = await storage.getUser(params.parentUserId);
    if (parentHasMemberIdForCheckout(user?.memberId)) {
      membershipAlreadyPaid = true;
    } else {
      const membership = await resolveMembershipOwedForCheckout(params.parentUserId, params.schoolId);
      membershipTotalCents = membership?.owedCents ?? 0;
      membershipAlreadyPaid = membership?.alreadyPaid ?? membershipTotalCents === 0;
    }
  } else if (hasMembersOnlyLine && !params.parentUserId) {
    const school = await storage.getSchool(params.schoolId);
    membershipTotalCents = school?.membershipFeeAmount ?? 0;
    membershipAlreadyPaid = membershipTotalCents === 0;
  }

  const amountDueCents = itemsTotalCents + (membershipAlreadyPaid ? 0 : membershipTotalCents);

  return {
    snapshotId: '',
    schoolId: params.schoolId,
    lines: snapshotLines,
    membershipTotalCents: membershipAlreadyPaid ? 0 : membershipTotalCents,
    itemsTotalCents,
    amountDueCents,
    hasMembersOnlyLine,
    membershipAlreadyPaid,
  };
}
