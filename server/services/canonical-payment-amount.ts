import { storage } from '../storage';
import type { ProgramEnrollment } from '@shared/schema';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';

export interface CanonicalAmountInput {
  enrollmentIds: number[];
  parentId: number;
  parentEmail: string;
}

export interface CanonicalAmountResult {
  totalAmountCents: number;
  enrollmentIds: number[];
}

type EnrollmentWithBalance = ProgramEnrollment & {
  effectiveBalance?: number | null;
  remainingBalance?: number | null;
  parentId?: number | null;
};

/**
 * Server-authoritative balance calculator for "pay balance" flows.
 *
 * Sums the current outstanding balance via resolveEnrollmentEffectiveBalance
 * (DB `effective_balance` or canonical formula — never raw `remaining_balance`
 * alone) across the supplied program_enrollments belonging to the given parent.
 * Enrollments that fail the tenant check or have a non-positive balance are
 * excluded so the caller never charges $0 or crosses tenants.
 *
 * Tenant guard: an enrollment is only counted when its parentId is present
 * AND equals the requesting parent's ID. Records with a null/missing parentId
 * are treated as untrusted and rejected — never silently included.
 *
 * Returns the total in cents and the list of enrollment IDs that actually
 * contributed to the total.
 */
export async function calculateCanonicalEnrollmentAmount(
  input: CanonicalAmountInput,
): Promise<CanonicalAmountResult> {
  const ids = Array.isArray(input.enrollmentIds)
    ? input.enrollmentIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : [];

  if (ids.length === 0 || !Number.isFinite(Number(input.parentId))) {
    return { totalAmountCents: 0, enrollmentIds: [] };
  }

  const parentId = Number(input.parentId);
  let totalAmountCents = 0;
  const usedIds: number[] = [];

  for (const id of ids) {
    const enrollment = (await storage.getProgramEnrollmentById(
      id,
    )) as EnrollmentWithBalance | undefined;
    if (!enrollment) continue;

    // Strict tenant guard: reject any record whose parentId is missing OR
    // does not match the requesting parent. Authorization MUST NOT depend on
    // parentEmail (which is informational and logged by the caller).
    const enrollmentParentId =
      typeof enrollment.parentId === 'number' ? enrollment.parentId : null;
    if (enrollmentParentId === null || enrollmentParentId !== parentId) {
      continue;
    }

    const balance = resolveEnrollmentEffectiveBalance(enrollment);
    if (balance > 0) {
      totalAmountCents += balance;
      usedIds.push(id);
    }
  }

  // parentEmail is accepted for caller-side logging/metadata symmetry with
  // other billing endpoints; it is intentionally not used for authorization.
  void input.parentEmail;

  return { totalAmountCents, enrollmentIds: usedIds };
}
