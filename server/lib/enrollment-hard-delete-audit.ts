import { auditLogs, type InsertAuditLog } from "../../shared/schema";
import { getDb } from "../db";

/** Null a Supabase UUID so audit_logs.actor_id (integer) does not 500. */
export function numericActorId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export const PARENT_CART_REMOVE_ACTION = "parent_cart_remove_enrollment";
export const ADMIN_ENROLLMENT_DELETE_ACTION = "admin_delete_enrollment";

export type EnrollmentHardDeleteSource =
  | "parent_unenroll"
  | "parent_cancel_multiple"
  | "parent_legacy_delete"
  | "admin_delete";

export type EnrollmentHardDeleteRow = {
  id: number;
  schoolId?: number | null;
  childId?: number | null;
  childName?: string | null;
  className?: string | null;
  parentId?: number | null;
  parentEmail?: string | null;
  sessionId?: number | null;
  dayType?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  totalCost?: number | null;
  totalPaid?: number | null;
  remainingBalance?: number | null;
  effectiveBalance?: number | null;
  enrollmentVersion?: string | null;
  marketplaceClassId?: number | null;
  notes?: string | null;
};

export type EnrollmentHardDeleteActor = {
  id?: unknown;
  role?: string | null;
  email?: string | null;
};

/** Snapshot money + seat fields before hard-delete so `audit_logs` still has them. */
export function enrollmentHardDeleteSnapshot(enrollment: EnrollmentHardDeleteRow) {
  return {
    id: enrollment.id,
    childId: enrollment.childId ?? null,
    childName: enrollment.childName ?? null,
    className: enrollment.className ?? null,
    parentId: enrollment.parentId ?? null,
    parentEmail: enrollment.parentEmail ?? null,
    sessionId: enrollment.sessionId ?? null,
    dayType: enrollment.dayType ?? null,
    status: enrollment.status ?? null,
    paymentStatus: enrollment.paymentStatus ?? null,
    totalCost: enrollment.totalCost ?? null,
    totalPaid: enrollment.totalPaid ?? null,
    remainingBalance: enrollment.remainingBalance ?? null,
    effectiveBalance: enrollment.effectiveBalance ?? null,
    enrollmentVersion: enrollment.enrollmentVersion ?? null,
    marketplaceClassId: enrollment.marketplaceClassId ?? null,
    notes: enrollment.notes ?? null,
  };
}

export function buildEnrollmentHardDeleteAuditLog(opts: {
  enrollment: EnrollmentHardDeleteRow;
  actor: EnrollmentHardDeleteActor;
  source: EnrollmentHardDeleteSource;
  ipAddress?: string | null;
  userAgent?: string | null;
}): InsertAuditLog {
  const parentSource = opts.source.startsWith("parent_");
  return {
    actionType: parentSource ? PARENT_CART_REMOVE_ACTION : ADMIN_ENROLLMENT_DELETE_ACTION,
    severity: "info",
    actorId: numericActorId(opts.actor.id),
    actorRole: opts.actor.role || (parentSource ? "parent" : "schoolAdmin"),
    actorEmail: opts.actor.email ?? null,
    targetType: "program_enrollment",
    targetId: String(opts.enrollment.id),
    schoolId: opts.enrollment.schoolId ?? null,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: {
      source: opts.source,
      enrollment: enrollmentHardDeleteSnapshot(opts.enrollment),
    },
  };
}

/** Write after a successful hard-delete. Never throws. */
export async function logEnrollmentHardDelete(opts: {
  enrollment: EnrollmentHardDeleteRow;
  actor: EnrollmentHardDeleteActor;
  source: EnrollmentHardDeleteSource;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[audit] skipped enrollment hard-delete log: no database");
      return;
    }
    await db.insert(auditLogs).values({
      ...buildEnrollmentHardDeleteAuditLog(opts),
      actorId: numericActorId(opts.actor.id),
    });
  } catch (error) {
    console.error("[audit] failed to write enrollment hard-delete log:", error);
  }
}
