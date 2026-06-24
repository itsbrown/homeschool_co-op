import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '../db';
import { programEnrollments } from '@shared/schema';
import { createEnrollmentDataSimple } from '@shared/enrollment-factory';
import { storage } from '../storage';
import type { StoreSnapshotLine } from './store-pricing';
import { getClassById, getSessionById } from './store-storage';

export function describeExistingSessionEnrollment(row: {
  id?: number;
  status?: string | null;
  variantId?: string | null;
}): string {
  const status = String(row.status ?? '').toLowerCase();
  const idHint = row.id != null ? ` (enrollment #${row.id})` : '';
  if (status === 'waitlist') {
    return 'already on the waitlist for this session';
  }
  if (status === 'pending_payment' || status === 'pending_admin_approval') {
    return `already reserved${idHint}`;
  }
  if (status === 'enrolled') {
    return 'already enrolled for this session';
  }
  return `already has an enrollment (${status || 'active'})`;
}

async function findExistingEnrollment(params: {
  childId: number;
  sessionId?: number;
  classId?: number;
  variant?: string;
}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.childId, params.childId),
        params.sessionId != null
          ? eq(programEnrollments.sessionId, params.sessionId)
          : eq(programEnrollments.marketplaceClassId, params.classId!),
        notInArray(programEnrollments.status, ['cancelled', 'completed']),
      ),
    );
  if (params.variant && params.sessionId != null) {
    return rows.find((r: { variantId?: string | null }) => r.variantId === params.variant) ?? rows[0];
  }
  return rows[0];
}

export interface StoreChildRef {
  childId: number;
  firstName: string;
  lastName: string;
}

export async function resolveStoreParent(params: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  schoolId: number;
  authenticatedUserId?: number | null;
}): Promise<{ parentId: number; created: boolean } | { error: 'sign_in_required' }> {
  if (params.authenticatedUserId) {
    const user = await storage.getUser(params.authenticatedUserId);
    if (user) return { parentId: user.id, created: false };
  }

  const existing = await storage.getUserByEmail(params.email);
  if (existing) {
    if (!params.authenticatedUserId) {
      return { error: 'sign_in_required' };
    }
    return { parentId: existing.id, created: false };
  }

  const parentUser = await storage.createUser({
    email: params.email,
    username: params.email,
    password: '',
    name: `${params.firstName} ${params.lastName}`.trim(),
    firstName: params.firstName,
    lastName: params.lastName,
    phone: params.phone ?? null,
    role: 'parent',
    schoolId: params.schoolId,
    isActive: true,
  } as any);

  await (storage as any).createUserRole({
    userId: parentUser.id,
    role: 'parent',
    schoolId: params.schoolId,
    isPrimary: true,
  });

  return { parentId: parentUser.id, created: true };
}

export async function resolveStoreChild(params: {
  parentId: number;
  parentEmail: string;
  schoolId: number;
  childId?: number;
  draft?: { firstName: string; lastName: string; birthdate: string; gradeLevel: string };
}): Promise<StoreChildRef> {
  if (params.childId) {
    const child = await storage.getChildById(params.childId);
    if (!child || child.parentId !== params.parentId) {
      throw new Error('Invalid child selection');
    }
    return {
      childId: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
    };
  }
  if (!params.draft) {
    throw new Error('Child information required');
  }
  const created = await storage.createChild({
    firstName: params.draft.firstName,
    lastName: params.draft.lastName,
    birthdate: params.draft.birthdate,
    gradeLevel: params.draft.gradeLevel,
    parentId: params.parentId,
    parentEmail: params.parentEmail,
    schoolId: params.schoolId,
  } as any);
  return {
    childId: created.id,
    firstName: created.firstName,
    lastName: created.lastName,
  };
}

export interface CreatedStoreEnrollment {
  enrollmentId: number;
  line: StoreSnapshotLine;
  status: string;
  waitlistPosition?: number | null;
}

export async function createStoreProgramEnrollments(params: {
  schoolId: number;
  parentId: number;
  parentEmail: string;
  lines: StoreSnapshotLine[];
  childByLineId: Map<string, StoreChildRef>;
  storeOrderId?: number;
  checkoutSessionId?: string;
}): Promise<{ created: CreatedStoreEnrollment[]; skipped: string[] }> {
  const created: CreatedStoreEnrollment[] = [];
  const skipped: string[] = [];

  for (const line of params.lines) {
    if (line.listingType === 'product' || line.unavailableReason) continue;
    const child = params.childByLineId.get(line.lineId);
    if (!child) {
      skipped.push(`${line.title}: child not assigned`);
      continue;
    }

    const existing = await findExistingEnrollment({
      childId: child.childId,
      sessionId: line.listingType === 'session' ? line.sourceId : undefined,
      classId: line.listingType === 'class' ? line.sourceId : undefined,
      variant: line.variant,
    });
    if (existing) {
      skipped.push(`${child.firstName} - ${line.title}: ${describeExistingSessionEnrollment(existing)}`);
      continue;
    }

    const isWaitlist = line.fulfillment === 'waitlist';
    const status = isWaitlist ? 'waitlist' : 'pending_payment';
    const totalCost = line.unitPriceCents;

    if (line.listingType === 'session') {
      const session = await getSessionById(line.sourceId);
      if (!session) continue;
      const variant = line.variant ?? 'full_day';
      const enrollmentData = createEnrollmentDataSimple({
        schoolId: params.schoolId,
        classType: 'marketplace',
        classId: null,
        marketplaceClassId: null,
        sessionId: session.id,
        locationId: session.locationId ?? null,
        enrollmentVersion: 'v2',
        dayType: variant,
        enrolledHalfDayPrice: session.halfDayPrice ?? null,
        enrolledFullDayPrice: session.fullDayPrice ?? null,
        childId: child.childId,
        childName: `${child.firstName} ${child.lastName}`,
        className: line.title,
        variantId: variant,
        parentId: params.parentId,
        parentEmail: params.parentEmail,
        totalCost,
        totalPaid: 0,
        remainingBalance: isWaitlist ? totalCost : totalCost,
        depositRequired: 0,
        paymentStatus: 'pending',
        paymentPlan: 'full_payment',
        paymentFrequency: 'one_time',
        programStartDate: session.startDate,
        programEndDate: session.endDate,
        status: status as any,
        waitlistPosition: isWaitlist ? line.waitlistPosition ?? null : null,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        metadata: {
          enrollmentSource: 'public_store',
          storeOrderId: params.storeOrderId,
          checkoutSessionId: params.checkoutSessionId,
        },
      });
      const saved = await storage.createProgramEnrollment(enrollmentData);
      created.push({
        enrollmentId: saved.id,
        line,
        status: saved.status,
        waitlistPosition: saved.waitlistPosition,
      });
      continue;
    }

    if (line.listingType === 'class') {
      const cls = await getClassById(line.sourceId);
      if (!cls) continue;
      const enrollmentData = createEnrollmentDataSimple({
        schoolId: params.schoolId,
        classType: 'marketplace',
        classId: null,
        marketplaceClassId: cls.id,
        sessionId: null,
        childId: child.childId,
        childName: `${child.firstName} ${child.lastName}`,
        className: line.title,
        variantId: null,
        parentId: params.parentId,
        parentEmail: params.parentEmail,
        totalCost,
        totalPaid: 0,
        remainingBalance: isWaitlist ? totalCost : totalCost,
        depositRequired: 0,
        paymentStatus: 'pending',
        paymentPlan: 'full_payment',
        paymentFrequency: 'one_time',
        programStartDate: cls.startDate ?? null,
        programEndDate: cls.endDate ?? null,
        status: status as any,
        waitlistPosition: isWaitlist ? line.waitlistPosition ?? null : null,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        metadata: {
          enrollmentSource: 'public_store',
          storeOrderId: params.storeOrderId,
          checkoutSessionId: params.checkoutSessionId,
        },
      });
      const saved = await storage.createProgramEnrollment(enrollmentData);
      created.push({
        enrollmentId: saved.id,
        line,
        status: saved.status,
        waitlistPosition: saved.waitlistPosition,
      });
    }
  }

  return { created, skipped };
}

export async function applyStorePaymentToEnrollments(params: {
  enrollmentIds: number[];
  paymentIntentId: string;
  totalPaidCents: number;
}) {
  if (params.enrollmentIds.length === 0) return;
  const perEnrollment = Math.floor(params.totalPaidCents / params.enrollmentIds.length);
  let remainder = params.totalPaidCents - perEnrollment * params.enrollmentIds.length;

  for (const enrollmentId of params.enrollmentIds) {
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment || enrollment.status === 'waitlist') continue;
    const add = perEnrollment + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    const newPaid = (enrollment.totalPaid ?? 0) + add;
    const remaining = Math.max(0, (enrollment.totalCost ?? 0) - newPaid);
    await storage.updateProgramEnrollment(enrollmentId, {
      totalPaid: newPaid,
      remainingBalance: remaining,
      paymentStatus: remaining <= 0 ? 'completed' : 'partial_payment',
      status: remaining <= 0 ? 'enrolled' : enrollment.status,
      metadata: {
        ...(enrollment.metadata as object),
        stripePaymentIntentId: params.paymentIntentId,
      },
    } as any);
  }
}
