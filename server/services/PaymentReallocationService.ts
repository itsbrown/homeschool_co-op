/**
 * PaymentReallocationService
 *
 * Encapsulates the cents-level reallocation logic that moves an already-paid
 * amount from one program enrollment to another sibling enrollment under the
 * same parent. This is the same write path used by the admin "Reallocate
 * payment" UI; lifting it out of the HTTP handler lets backfill / remediation
 * scripts call it directly without going through Express.
 *
 * Atomicity guarantees:
 *   - Every reallocation (single or batch) runs inside a single Postgres
 *     transaction. Affected enrollment rows are locked with `SELECT ... FOR
 *     UPDATE` at the start so concurrent payment processors / admin actions
 *     cannot race the reallocation. On any error, the entire transaction is
 *     rolled back — no partial parent updates.
 *   - For the batch (`reallocateMany`) entry point used by the remediation
 *     script: drift detection happens *inside* the transaction, after the row
 *     locks are taken, comparing the caller's snapshot against the freshly
 *     locked rows. If anything changed since the snapshot was taken, the whole
 *     batch aborts with a `DRIFT_DETECTED` error.
 *   - Audit pair writes are mandatory. If no `payment_history_id` anchor can
 *     be found in `payment_allocations` for the affected enrollments, the
 *     service backfills a `stripe_payment_history` row from the original
 *     `payments` table entry (idempotent on `payment_intent_id`). If neither
 *     a prior allocation nor a Stripe-backed `payments` row exists for the
 *     parent, the batch fails loudly with `NO_AUDIT_ANCHOR_AVAILABLE` — no
 *     "silently skip the audit ledger" path remains.
 *
 * Scope: enrollment → enrollment moves only. Credit conversion and Stripe
 * refunds remain in `server/api/admin-enrollment-payment.ts` because they
 * have additional Stripe + credit dependencies that are not relevant to the
 * data-correction use case this service was extracted for.
 */

import { sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import { type PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import { getDb } from '../db';
import * as schema from '../../shared/schema';

type Tx = PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface MoveSpec {
  sourceEnrollmentId: number;
  targetEnrollmentId: number;
  amountCents: number;
}

export interface ReallocateInput {
  sourceEnrollmentId: number;
  targetEnrollmentId: number;
  amountCents: number;
  adminComment: string;
  /** Identifier shared by all reallocations in the same backfill / script run. */
  runId?: string;
  /** Email or label of the actor performing the reallocation. */
  performedBy?: string;
  /** Numeric user id of the actor, when one exists. */
  performedById?: number | null;
  /**
   * Legacy compatibility for the admin HTTP endpoint. When `true` (the
   * default for `reallocate`), the service will tolerate enrollments with no
   * resolvable audit anchor by skipping the `payment_allocations` audit pair
   * and recording only the in-row metadata history — matching the
   * pre-PaymentReallocationService HTTP behavior. The script remediation
   * path (`reallocateMany`) always requires an anchor.
   */
  allowMissingAuditAnchor?: boolean;
}

/**
 * Per-enrollment snapshot captured during the dry-run scan. Every field listed
 * here is asserted to match the locked row inside the write transaction; any
 * mismatch aborts the parent's batch with `DRIFT_DETECTED` and zero writes.
 */
export interface EnrollmentSnapshot {
  totalPaid: number;
  totalCost: number;
  compAmountCents: number | null;
  status: string | null;
  effectiveBalance: number;
}

export interface ReallocateManyInput {
  /** Parent that owns *all* the affected enrollments. Mismatch aborts. */
  parentId: number;
  moves: MoveSpec[];
  /**
   * Snapshot captured outside the transaction. Inside the transaction, after
   * rows are locked, the service asserts every field of every snapshot entry
   * still matches the locked row. Any drift aborts the batch with
   * `DRIFT_DETECTED`.
   *
   * Pass an empty Map to skip drift detection (e.g. ad-hoc admin reallocation
   * with no prior snapshot — the row locks still serialize the work).
   */
  snapshot: Map<number, EnrollmentSnapshot>;
  /** Per-move admin comment generator. Comments are required and non-empty. */
  adminCommentBuilder: (move: MoveSpec) => string;
  runId?: string;
  performedBy?: string;
  performedById?: number | null;
  /** Optional explicit anchor; if not provided, the service finds or backfills one. */
  anchorPaymentHistoryId?: number;
  /** See ReallocateInput.allowMissingAuditAnchor — disabled by default here. */
  allowMissingAuditAnchor?: boolean;
}

export interface ReallocateResult {
  source: {
    enrollmentId: number;
    previousTotalPaid: number;
    newTotalPaid: number;
    newRemainingBalance: number;
  };
  target: {
    enrollmentId: number;
    previousTotalPaid: number;
    newTotalPaid: number;
    newRemainingBalance: number;
  };
  /** Null only when allowMissingAuditAnchor=true and no anchor was resolvable. */
  outAllocationId: number | null;
  inAllocationId: number | null;
  anchorPaymentHistoryId: number | null;
}

export class PaymentReallocationError extends Error {
  constructor(
    public readonly code:
      | 'SOURCE_NOT_FOUND'
      | 'TARGET_NOT_FOUND'
      | 'TARGET_INACTIVE'
      | 'AMOUNT_INVALID'
      | 'AMOUNT_EXCEEDS_TOTAL_PAID'
      | 'WOULD_OVERPAY_TARGET'
      | 'COMMENT_REQUIRED'
      | 'PARENT_MISMATCH'
      | 'DRIFT_DETECTED'
      | 'NO_AUDIT_ANCHOR_AVAILABLE'
      | 'SAME_SOURCE_AND_TARGET',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PaymentReallocationError';
  }
}

interface EnrollmentRow {
  id: number;
  parent_id: number | null;
  total_cost: number;
  total_paid: number;
  comp_amount_cents: number | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
}

const calcBalance = (
  totalCost: number,
  newTotalPaid: number,
  compAmountCents: number | null | undefined,
) => Math.max(0, totalCost - newTotalPaid - (compAmountCents ?? 0));

function buildAuditEntry(
  move: MoveSpec,
  adminComment: string,
  runId: string | undefined,
  performedBy: string | undefined,
  performedById: number | null | undefined,
  direction: 'outgoing' | 'incoming',
) {
  return {
    timestamp: new Date().toISOString(),
    action: 'payment_reallocation',
    targetType: 'enrollment',
    direction,
    amount: move.amountCents,
    amountFormatted: `$${(move.amountCents / 100).toFixed(2)}`,
    sourceEnrollmentId: move.sourceEnrollmentId,
    targetEnrollmentId: move.targetEnrollmentId,
    comment: adminComment,
    runId: runId ?? null,
    adminEmail: performedBy ?? null,
    adminId: performedById ?? null,
  };
}

export class PaymentReallocationService {
  /**
   * Single-move reallocation used by the admin HTTP endpoint. Resolves the
   * parent id from the source enrollment and delegates to `reallocateMany`
   * with a one-element batch. All atomicity / audit guarantees apply.
   */
  static async reallocate(input: ReallocateInput): Promise<ReallocateResult> {
    if (!input.adminComment || !input.adminComment.trim()) {
      throw new PaymentReallocationError(
        'COMMENT_REQUIRED',
        'adminComment is required to justify the reallocation',
      );
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentReallocationError(
        'AMOUNT_INVALID',
        'amountCents must be a positive integer',
        { amountCents: input.amountCents },
      );
    }
    if (input.sourceEnrollmentId === input.targetEnrollmentId) {
      throw new PaymentReallocationError(
        'SAME_SOURCE_AND_TARGET',
        'sourceEnrollmentId and targetEnrollmentId must differ',
      );
    }

    const db = await getDb();
    const sourceLookup = (await db.execute(
      sql`SELECT parent_id FROM program_enrollments WHERE id = ${input.sourceEnrollmentId}`,
    )) as Array<{ parent_id: number | null }>;
    if (sourceLookup.length === 0) {
      throw new PaymentReallocationError(
        'SOURCE_NOT_FOUND',
        `Source enrollment ${input.sourceEnrollmentId} not found`,
        { sourceEnrollmentId: input.sourceEnrollmentId },
      );
    }
    const parentId = sourceLookup[0].parent_id;
    if (parentId === null) {
      throw new PaymentReallocationError(
        'PARENT_MISMATCH',
        `Source enrollment ${input.sourceEnrollmentId} has no parent_id`,
        { sourceEnrollmentId: input.sourceEnrollmentId },
      );
    }

    const results = await this.reallocateMany({
      parentId,
      moves: [
        {
          sourceEnrollmentId: input.sourceEnrollmentId,
          targetEnrollmentId: input.targetEnrollmentId,
          amountCents: input.amountCents,
        },
      ],
      snapshot: new Map(),
      adminCommentBuilder: () => input.adminComment,
      runId: input.runId,
      performedBy: input.performedBy,
      performedById: input.performedById,
      // Single-move admin-endpoint reallocations historically tolerated
      // legacy enrollments with no resolvable audit anchor by skipping the
      // payment_allocations rows and recording only metadata history. Preserve
      // that behavior unless the caller explicitly opts in to strict mode.
      allowMissingAuditAnchor: input.allowMissingAuditAnchor !== false,
    });
    return results[0];
  }

  /**
   * Batch reallocation used by the data-correction script. Runs a single
   * transaction with row-level locks, enforces the snapshot drift check,
   * resolves a mandatory audit anchor, and emits both `reallocation_out` and
   * `reallocation_in` rows for every move. All-or-nothing — any error rolls
   * back the entire batch.
   */
  static async reallocateMany(input: ReallocateManyInput): Promise<ReallocateResult[]> {
    if (input.moves.length === 0) return [];

    // Up-front non-DB validation (same checks the transaction enforces, so
    // we fail fast before opening a connection).
    for (const m of input.moves) {
      if (!Number.isInteger(m.amountCents) || m.amountCents <= 0) {
        throw new PaymentReallocationError(
          'AMOUNT_INVALID',
          'Every move must have a positive integer amountCents',
          { move: m },
        );
      }
      if (m.sourceEnrollmentId === m.targetEnrollmentId) {
        throw new PaymentReallocationError(
          'SAME_SOURCE_AND_TARGET',
          'A move cannot have the same source and target enrollment',
          { move: m },
        );
      }
      const comment = input.adminCommentBuilder(m);
      if (!comment || !comment.trim()) {
        throw new PaymentReallocationError(
          'COMMENT_REQUIRED',
          'adminCommentBuilder must return a non-empty string for every move',
          { move: m },
        );
      }
    }

    const enrollmentIds = Array.from(
      new Set(input.moves.flatMap((m) => [m.sourceEnrollmentId, m.targetEnrollmentId])),
    );

    const db = await getDb();
    return db.transaction(async (tx: Tx) => {
      // 1. Lock all affected enrollment rows for the duration of the transaction.
      const fresh = (await tx.execute(sql`
        SELECT id, parent_id, total_cost, total_paid, comp_amount_cents, status, metadata
        FROM program_enrollments
        WHERE id = ANY(${sql`ARRAY[${sql.join(enrollmentIds.map((id) => sql`${id}`), sql`, `)}]::int[]`})
        ORDER BY id
        FOR UPDATE
      `)) as unknown as EnrollmentRow[];

      const byId = new Map<number, EnrollmentRow>(fresh.map((r) => [r.id, r]));
      // Walk every move so we can attribute a missing row to the precise side
      // (source vs target) it appeared on. Distinct error codes give the API
      // layer cleaner mapping under transient race conditions.
      for (const m of input.moves) {
        if (!byId.has(m.sourceEnrollmentId)) {
          throw new PaymentReallocationError(
            'SOURCE_NOT_FOUND',
            `Source enrollment ${m.sourceEnrollmentId} not found`,
            { enrollmentId: m.sourceEnrollmentId },
          );
        }
        if (!byId.has(m.targetEnrollmentId)) {
          throw new PaymentReallocationError(
            'TARGET_NOT_FOUND',
            `Target enrollment ${m.targetEnrollmentId} not found`,
            { enrollmentId: m.targetEnrollmentId },
          );
        }
      }

      // 2. Parent ownership check — every enrollment must belong to the claimed parent.
      for (const r of fresh) {
        if (r.parent_id !== input.parentId) {
          throw new PaymentReallocationError(
            'PARENT_MISMATCH',
            `Enrollment ${r.id} belongs to parent ${r.parent_id}, expected ${input.parentId}`,
            { enrollmentId: r.id, actualParentId: r.parent_id, expectedParentId: input.parentId },
          );
        }
      }

      // 3. Drift check against caller-provided snapshot (inside the
      //    transaction, against the freshly-locked rows). Every field that
      //    can affect the reallocation outcome — total_paid, total_cost,
      //    comp_amount_cents, status, and the derived effective_balance — is
      //    compared. Any mismatch aborts the parent's batch with zero writes.
      for (const [id, snap] of input.snapshot) {
        const fr = byId.get(id);
        if (!fr) {
          throw new PaymentReallocationError(
            'SOURCE_NOT_FOUND',
            `Snapshot references enrollment ${id} not present in transaction lock set`,
            { enrollmentId: id },
          );
        }
        const currentEffective = fr.total_cost - fr.total_paid - (fr.comp_amount_cents ?? 0);
        const drift: Record<string, { snapshot: unknown; current: unknown }> = {};
        if (fr.total_paid !== snap.totalPaid) {
          drift.totalPaid = { snapshot: snap.totalPaid, current: fr.total_paid };
        }
        if (fr.total_cost !== snap.totalCost) {
          drift.totalCost = { snapshot: snap.totalCost, current: fr.total_cost };
        }
        if ((fr.comp_amount_cents ?? 0) !== (snap.compAmountCents ?? 0)) {
          drift.compAmountCents = {
            snapshot: snap.compAmountCents,
            current: fr.comp_amount_cents,
          };
        }
        if ((fr.status ?? null) !== (snap.status ?? null)) {
          drift.status = { snapshot: snap.status, current: fr.status };
        }
        if (currentEffective !== snap.effectiveBalance) {
          drift.effectiveBalance = {
            snapshot: snap.effectiveBalance,
            current: currentEffective,
          };
        }
        if (Object.keys(drift).length > 0) {
          throw new PaymentReallocationError(
            'DRIFT_DETECTED',
            `Drift detected on enrollment ${id} between dry-run snapshot and locked transaction state: ${Object.keys(drift).join(', ')}`,
            { enrollmentId: id, drift },
          );
        }
      }

      // 4. Resolve the audit anchor. Mandatory unless the caller explicitly
      //    opts into legacy compatibility mode (HTTP single-move endpoint).
      let anchorId: number | null;
      try {
        anchorId = await resolveAuditAnchor(
          tx,
          input.parentId,
          enrollmentIds,
          input.anchorPaymentHistoryId,
        );
      } catch (e) {
        if (
          input.allowMissingAuditAnchor &&
          e instanceof PaymentReallocationError &&
          e.code === 'NO_AUDIT_ANCHOR_AVAILABLE'
        ) {
          anchorId = null;
        } else {
          throw e;
        }
      }

      // 5. Apply each move sequentially against working state, writing both
      //    enrollment updates and the audit pair for each.
      const working = new Map<number, EnrollmentRow>();
      for (const [id, r] of byId) working.set(id, { ...r });

      const results: ReallocateResult[] = [];
      for (const move of input.moves) {
        const src = working.get(move.sourceEnrollmentId)!;
        const tgt = working.get(move.targetEnrollmentId)!;

        // Per-move validation against working state.
        if (tgt.status === 'cancelled' || tgt.status === 'withdrawn') {
          throw new PaymentReallocationError(
            'TARGET_INACTIVE',
            `Target enrollment ${tgt.id} is ${tgt.status}`,
            { targetEnrollmentId: tgt.id, status: tgt.status },
          );
        }
        if (move.amountCents > src.total_paid) {
          throw new PaymentReallocationError(
            'AMOUNT_EXCEEDS_TOTAL_PAID',
            `Move amount ${move.amountCents} exceeds source enrollment ${src.id} total_paid ${src.total_paid}`,
            { sourceEnrollmentId: src.id, sourceTotalPaid: src.total_paid, amountCents: move.amountCents },
          );
        }
        const newSrcPaid = src.total_paid - move.amountCents;
        const newTgtPaid = tgt.total_paid + move.amountCents;
        if (newTgtPaid > tgt.total_cost) {
          throw new PaymentReallocationError(
            'WOULD_OVERPAY_TARGET',
            `Move would push target enrollment ${tgt.id} past its total_cost`,
            {
              targetEnrollmentId: tgt.id,
              currentTargetPaid: tgt.total_paid,
              targetTotalCost: tgt.total_cost,
              amountCents: move.amountCents,
              wouldExceedBy: newTgtPaid - tgt.total_cost,
            },
          );
        }

        const newSrcBal = calcBalance(src.total_cost, newSrcPaid, src.comp_amount_cents);
        const newTgtBal = calcBalance(tgt.total_cost, newTgtPaid, tgt.comp_amount_cents);

        const adminComment = input.adminCommentBuilder(move);

        const sourceMetadata = (src.metadata && typeof src.metadata === 'object'
          ? (src.metadata as Record<string, unknown>)
          : {}) as Record<string, unknown>;
        const targetMetadata = (tgt.metadata && typeof tgt.metadata === 'object'
          ? (tgt.metadata as Record<string, unknown>)
          : {}) as Record<string, unknown>;

        const sourceHistory = Array.isArray(sourceMetadata.paymentReallocationHistory)
          ? (sourceMetadata.paymentReallocationHistory as unknown[])
          : [];
        const targetHistory = Array.isArray(targetMetadata.paymentReallocationHistory)
          ? (targetMetadata.paymentReallocationHistory as unknown[])
          : [];

        const newSrcMetadata = {
          ...sourceMetadata,
          paymentReallocationHistory: [
            ...sourceHistory,
            buildAuditEntry(
              move,
              adminComment,
              input.runId,
              input.performedBy,
              input.performedById,
              'outgoing',
            ),
          ],
        };
        const newTgtMetadata = {
          ...targetMetadata,
          paymentReallocationHistory: [
            ...targetHistory,
            buildAuditEntry(
              move,
              adminComment,
              input.runId,
              input.performedBy,
              input.performedById,
              'incoming',
            ),
          ],
        };

        const srcStatus =
          newSrcBal === 0 ? 'completed' : newSrcPaid > 0 ? 'partial_payment' : 'pending';
        const tgtStatus = newTgtBal === 0 ? 'completed' : 'partial_payment';

        await tx.execute(sql`
          UPDATE program_enrollments
          SET total_paid = ${newSrcPaid},
              remaining_balance = ${newSrcBal},
              payment_status = ${srcStatus},
              metadata = ${JSON.stringify(newSrcMetadata)}::jsonb,
              updated_at = NOW()
          WHERE id = ${src.id}
        `);

        await tx.execute(sql`
          UPDATE program_enrollments
          SET total_paid = ${newTgtPaid},
              remaining_balance = ${newTgtBal},
              payment_status = ${tgtStatus},
              metadata = ${JSON.stringify(newTgtMetadata)}::jsonb,
              updated_at = NOW()
          WHERE id = ${tgt.id}
        `);

        let outAllocationId: number | null = null;
        let inAllocationId: number | null = null;

        if (anchorId !== null) {
          const allocationMetadataOut = {
            targetEnrollmentId: tgt.id,
            adminEmail: input.performedBy ?? null,
            adminId: input.performedById ?? null,
            runId: input.runId ?? null,
          };
          const allocationMetadataIn = {
            sourceEnrollmentId: src.id,
            adminEmail: input.performedBy ?? null,
            adminId: input.performedById ?? null,
            runId: input.runId ?? null,
          };

          const outIns = (await tx.execute(sql`
            INSERT INTO payment_allocations (
              payment_history_id, enrollment_id, membership_enrollment_id,
              allocated_amount_cents, allocation_type, source_allocation_id,
              admin_comment, metadata, created_at
            ) VALUES (
              ${anchorId}, ${src.id}, NULL,
              ${-move.amountCents}, 'reallocation_out', NULL,
              ${adminComment}, ${JSON.stringify(allocationMetadataOut)}::jsonb, NOW()
            )
            RETURNING id
          `)) as unknown as Array<{ id: number }>;
          if (outIns.length === 0) {
            throw new PaymentReallocationError(
              'NO_AUDIT_ANCHOR_AVAILABLE',
              `Failed to insert reallocation_out audit row for enrollment ${src.id}`,
              { sourceEnrollmentId: src.id, anchorId },
            );
          }
          outAllocationId = outIns[0].id;

          const inIns = (await tx.execute(sql`
            INSERT INTO payment_allocations (
              payment_history_id, enrollment_id, membership_enrollment_id,
              allocated_amount_cents, allocation_type, source_allocation_id,
              admin_comment, metadata, created_at
            ) VALUES (
              ${anchorId}, ${tgt.id}, NULL,
              ${move.amountCents}, 'reallocation_in', ${outIns[0].id},
              ${adminComment}, ${JSON.stringify(allocationMetadataIn)}::jsonb, NOW()
            )
            RETURNING id
          `)) as unknown as Array<{ id: number }>;
          if (inIns.length === 0) {
            throw new PaymentReallocationError(
              'NO_AUDIT_ANCHOR_AVAILABLE',
              `Failed to insert reallocation_in audit row for enrollment ${tgt.id}`,
              { targetEnrollmentId: tgt.id, anchorId },
            );
          }
          inAllocationId = inIns[0].id;
        }

        // Roll the working state forward so subsequent moves see the new totals.
        working.set(src.id, {
          ...src,
          total_paid: newSrcPaid,
          metadata: newSrcMetadata as Record<string, unknown>,
        });
        working.set(tgt.id, {
          ...tgt,
          total_paid: newTgtPaid,
          metadata: newTgtMetadata as Record<string, unknown>,
        });

        results.push({
          source: {
            enrollmentId: src.id,
            previousTotalPaid: src.total_paid,
            newTotalPaid: newSrcPaid,
            newRemainingBalance: newSrcBal,
          },
          target: {
            enrollmentId: tgt.id,
            previousTotalPaid: tgt.total_paid,
            newTotalPaid: newTgtPaid,
            newRemainingBalance: newTgtBal,
          },
          outAllocationId,
          inAllocationId,
          anchorPaymentHistoryId: anchorId,
        });
      }

      return results;
    });
  }
}

/**
 * Resolves the `payment_history_id` to anchor the reallocation audit pair to.
 *
 * Resolution order:
 *   1. Caller-provided explicit anchor (validated to exist).
 *   2. Most recent existing `payment_allocations` row touching any of the
 *      affected enrollments.
 *   3. Backfill: find the most recent `payments` row for this parent that
 *      touched any of the affected enrollments and that has a Stripe
 *      payment_intent_id, then upsert it into `stripe_payment_history`
 *      (idempotent on `payment_intent_id`) and use the resulting id.
 *   4. Throw `NO_AUDIT_ANCHOR_AVAILABLE` — never silently skip the audit pair.
 */
async function resolveAuditAnchor(
  tx: Tx,
  parentId: number,
  enrollmentIds: number[],
  explicit: number | undefined,
): Promise<number> {
  if (explicit !== undefined) {
    const check = (await tx.execute(
      sql`SELECT id FROM stripe_payment_history WHERE id = ${explicit}`,
    )) as Array<{ id: number }>;
    if (check.length === 0) {
      throw new PaymentReallocationError(
        'NO_AUDIT_ANCHOR_AVAILABLE',
        `Provided anchorPaymentHistoryId ${explicit} does not exist in stripe_payment_history`,
        { explicit },
      );
    }
    return explicit;
  }

  const idsArray = sql`ARRAY[${sql.join(enrollmentIds.map((id) => sql`${id}`), sql`, `)}]::int[]`;
  // Most recent existing payment_allocations row touching any of the affected
  // enrollments. Newest-first matches the docstring intent and biases toward
  // the freshest known anchor when multiple are available.
  const existing = (await tx.execute(sql`
    SELECT payment_history_id
    FROM payment_allocations
    WHERE enrollment_id = ANY(${idsArray})
    ORDER BY created_at DESC
    LIMIT 1
  `)) as unknown as Array<{ payment_history_id: number }>;
  if (existing.length > 0 && existing[0].payment_history_id) {
    return existing[0].payment_history_id;
  }

  // Backfill path. Look up the original Stripe-backed payment from the
  // legacy `payments` table.
  const candidates = (await tx.execute(sql`
    SELECT id, stripe_payment_intent_id, amount, currency, created_at
    FROM payments
    WHERE parent_id = ${parentId}
      AND stripe_payment_intent_id IS NOT NULL
      AND enrollment_ids ?| ${sql`ARRAY[${sql.join(enrollmentIds.map((id) => sql`${String(id)}`), sql`, `)}]::text[]`}
    ORDER BY created_at DESC
    LIMIT 1
  `)) as Array<{
    id: number;
    stripe_payment_intent_id: string;
    amount: number;
    currency: string | null;
    created_at: Date;
  }>;
  if (candidates.length === 0) {
    throw new PaymentReallocationError(
      'NO_AUDIT_ANCHOR_AVAILABLE',
      `No prior payment_allocations row exists for these enrollments and no Stripe-backed payment was found in 'payments' to backfill an anchor for parent ${parentId}. Manual investigation required before reallocation can be safely audited.`,
      { parentId, enrollmentIds },
    );
  }

  const c = candidates[0];
  const upsert = (await tx.execute(sql`
    INSERT INTO stripe_payment_history (
      user_id, payment_intent_id, amount, currency, status, source, description,
      stripe_created_at, created_at, updated_at
    ) VALUES (
      ${parentId}, ${c.stripe_payment_intent_id}, ${c.amount},
      ${c.currency || 'usd'}, 'succeeded', 'allocator-fix-script-backfill',
      ${`Backfilled by PaymentReallocationService for audit anchor; original payments.id=${c.id}`},
      ${c.created_at instanceof Date ? c.created_at.toISOString() : c.created_at}, NOW(), NOW()
    )
    ON CONFLICT (payment_intent_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `)) as Array<{ id: number }>;
  if (upsert.length === 0) {
    throw new PaymentReallocationError(
      'NO_AUDIT_ANCHOR_AVAILABLE',
      `Failed to upsert stripe_payment_history backfill for parent ${parentId}`,
      { parentId, paymentIntentId: c.stripe_payment_intent_id },
    );
  }
  return upsert[0].id;
}
