/**
 * Real-DB atomicity test for PaymentReallocationService (Task #201).
 *
 * Runs against the live dev Postgres. When a mid-batch move throws inside
 * `reallocateMany`'s per-move write loop, the surrounding `db.transaction`
 * wrapper must roll back every prior write. We assert this with a
 * post-failure SELECT that checks both source/target enrollment rows and
 * the `payment_allocations` audit-pair count.
 *
 * Two scenarios:
 *   1. Anchor absent  — proves enrollment-row UPDATEs roll back.
 *   2. Anchor present — proves audit-pair INSERTs roll back too.
 *
 * Common scenario:
 *   source: totalCost=5000, totalPaid=5000     (can give cents)
 *   target: totalCost=10000, totalPaid=0        (can receive)
 *   Move #1: source → target $1.00              (valid)
 *   Move #2: source → target $1,000,000         (throws AMOUNT_EXCEEDS_TOTAL_PAID
 *                                                inside per-move loop AFTER #1's
 *                                                writes were issued)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const BASE_URL = 'http://localhost:5000';
const HEADERS = {
  'X-Test-Token': 'test-secret-token',
  'Content-Type': 'application/json',
};

interface PairResponse {
  success: true;
  sourceEnrollmentId: number;
  targetEnrollmentId: number;
  parentId: number;
  schoolId: number;
  classId: number;
  childId: number;
}

interface EnrollmentResponse {
  success: true;
  enrollment: {
    id: number;
    totalCost: number;
    totalPaid: number;
    remainingBalance: number;
    paymentStatus: string | null;
    metadata: Record<string, unknown> | null;
  };
}

async function setupPair(): Promise<PairResponse> {
  const res = await fetch(`${BASE_URL}/api/test/setup-reallocation-pair`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      sourcePaidCents: 5000,
      sourceTotalCostCents: 5000,
      targetPaidCents: 0,
      targetTotalCostCents: 10000,
    }),
  });
  if (!res.ok) {
    throw new Error(`setup-reallocation-pair failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as PairResponse;
}

async function fetchEnrollment(id: number): Promise<EnrollmentResponse['enrollment']> {
  const res = await fetch(`${BASE_URL}/api/test/enrollment/${id}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`enrollment/${id} fetch failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as EnrollmentResponse;
  return data.enrollment;
}

/**
 * Backfill `school_class_enrollments` rows whose ids match the program-
 * enrollment ids the allocator will INSERT into `payment_allocations`.
 * `payment_allocations.enrollment_id` FKs `school_class_enrollments(id)`,
 * but the allocator writes program-enrollment ids into that column. In
 * production both sides share ids because checkout seeds them together.
 * Test fixtures don't, so we backfill here. `session_replication_role =
 * replica` skips the `class_id` / `student_id` sub-FKs (the test only
 * needs the row id to satisfy the audit-pair INSERT FK), scoped to a
 * single transaction. Tracked as follow-up #244.
 *
 * Also backfills `payment_allocations.membership_enrollment_id` if the
 * column is missing in dev (allocator writes it but `shared/schema.ts`
 * and the dev DB don't declare it). Idempotent ADD COLUMN IF NOT EXISTS.
 * Tracked as follow-up #245.
 */
async function fixtureBackfill(pair: PairResponse): Promise<void> {
  const { getDb } = await import('../db');
  const { sql } = await import('drizzle-orm');
  const db = await getDb();
  if (!db) throw new Error('getDb() returned null');

  await db.execute(sql`
    ALTER TABLE payment_allocations
    ADD COLUMN IF NOT EXISTS membership_enrollment_id integer NULL
  `);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = 'replica'`);
    await tx.execute(sql`
      INSERT INTO school_class_enrollments (id, class_id, student_id, status)
      VALUES (${pair.sourceEnrollmentId}, ${pair.classId}, ${pair.childId}, 'enrolled')
      ON CONFLICT (id) DO NOTHING
    `);
    await tx.execute(sql`
      INSERT INTO school_class_enrollments (id, class_id, student_id, status)
      VALUES (${pair.targetEnrollmentId}, ${pair.classId}, ${pair.childId}, 'enrolled')
      ON CONFLICT (id) DO NOTHING
    `);
  });
}

async function seedAuditAnchor(parentId: number, amountCents: number): Promise<number> {
  const { getDb } = await import('../db');
  const { stripePaymentHistory } = await import('../../shared/schema');
  const db = await getDb();
  if (!db) throw new Error('getDb() returned null');
  const inserted = await db
    .insert(stripePaymentHistory)
    .values({
      userId: parentId,
      paymentIntentId: `pi_test_realloc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount: Math.max(amountCents, 1),
      currency: 'usd',
      status: 'succeeded',
      source: 'stripe',
      description: 'Task #201 reallocation atomicity anchor',
      stripeCreatedAt: new Date(),
    })
    .returning({ id: stripePaymentHistory.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error('Failed to seed audit anchor');
  return id;
}

async function countAuditPairsForAnchor(anchorId: number): Promise<number> {
  const { getDb } = await import('../db');
  const { sql } = await import('drizzle-orm');
  const db = await getDb();
  if (!db) throw new Error('getDb() returned null');
  const rows = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM payment_allocations WHERE payment_history_id = ${anchorId}`,
  )) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

describe('PaymentReallocationService — real-DB atomicity', () => {
  let PaymentReallocationService: typeof import('../services/PaymentReallocationService').PaymentReallocationService;
  let PaymentReallocationError: typeof import('../services/PaymentReallocationService').PaymentReallocationError;

  beforeAll(async () => {
    const mod = await import('../services/PaymentReallocationService');
    PaymentReallocationService = mod.PaymentReallocationService;
    PaymentReallocationError = mod.PaymentReallocationError;
  });

  it('rolls back move #1 enrollment-row writes when move #2 throws AMOUNT_EXCEEDS_TOTAL_PAID (no audit anchor)', async () => {
    const pair = await setupPair();
    const preSrc = await fetchEnrollment(pair.sourceEnrollmentId);
    const preTgt = await fetchEnrollment(pair.targetEnrollmentId);
    expect(preSrc.totalPaid).toBe(5000);
    expect(preTgt.totalPaid).toBe(0);

    let thrown: unknown = null;
    try {
      await PaymentReallocationService.reallocateMany({
        parentId: pair.parentId,
        moves: [
          {
            sourceEnrollmentId: pair.sourceEnrollmentId,
            targetEnrollmentId: pair.targetEnrollmentId,
            amountCents: 100,
          },
          {
            sourceEnrollmentId: pair.sourceEnrollmentId,
            targetEnrollmentId: pair.targetEnrollmentId,
            amountCents: 1_000_000,
          },
        ],
        snapshot: new Map(),
        adminCommentBuilder: () => 'task-201-atomicity-no-anchor',
        runId: 'task-201-atomicity-no-anchor',
        performedBy: 'task-201-test',
        performedById: null,
        // Bypass audit-anchor requirement; this variant proves the
        // enrollment-row UPDATE rollback. The companion test below
        // proves the audit-pair INSERT rollback with an anchor present.
        allowMissingAuditAnchor: true,
      });
      throw new Error('reallocateMany unexpectedly resolved with no error');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(PaymentReallocationError);
    expect((thrown as InstanceType<typeof PaymentReallocationError>).code).toBe(
      'AMOUNT_EXCEEDS_TOTAL_PAID',
    );

    const postSrc = await fetchEnrollment(pair.sourceEnrollmentId);
    const postTgt = await fetchEnrollment(pair.targetEnrollmentId);

    expect(postSrc.totalPaid).toBe(preSrc.totalPaid);
    expect(postSrc.remainingBalance).toBe(preSrc.remainingBalance);
    expect(postSrc.paymentStatus).toBe(preSrc.paymentStatus);
    expect(postSrc.metadata).toEqual(preSrc.metadata);

    expect(postTgt.totalPaid).toBe(preTgt.totalPaid);
    expect(postTgt.remainingBalance).toBe(preTgt.remainingBalance);
    expect(postTgt.paymentStatus).toBe(preTgt.paymentStatus);
    expect(postTgt.metadata).toEqual(preTgt.metadata);
  });

  it('rolls back BOTH enrollment-row writes AND payment_allocations audit-pair inserts when move #2 throws (anchor present)', async () => {
    const pair = await setupPair();
    await fixtureBackfill(pair);
    const anchorId = await seedAuditAnchor(pair.parentId, 5000);

    const preSrc = await fetchEnrollment(pair.sourceEnrollmentId);
    const preTgt = await fetchEnrollment(pair.targetEnrollmentId);
    const preAuditCount = await countAuditPairsForAnchor(anchorId);
    expect(preSrc.totalPaid).toBe(5000);
    expect(preTgt.totalPaid).toBe(0);
    expect(preAuditCount).toBe(0);

    let thrown: unknown = null;
    try {
      await PaymentReallocationService.reallocateMany({
        parentId: pair.parentId,
        moves: [
          {
            sourceEnrollmentId: pair.sourceEnrollmentId,
            targetEnrollmentId: pair.targetEnrollmentId,
            amountCents: 100,
          },
          {
            sourceEnrollmentId: pair.sourceEnrollmentId,
            targetEnrollmentId: pair.targetEnrollmentId,
            amountCents: 1_000_000,
          },
        ],
        snapshot: new Map(),
        adminCommentBuilder: () => 'task-201-atomicity-with-anchor',
        runId: 'task-201-atomicity-with-anchor',
        performedBy: 'task-201-test',
        performedById: null,
        anchorPaymentHistoryId: anchorId,
        // Strict mode — REQUIRES audit-pair writes for move #1, so this
        // run actually exercises the rollback path being tested.
        allowMissingAuditAnchor: false,
      });
      throw new Error('reallocateMany unexpectedly resolved with no error');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(PaymentReallocationError);
    expect((thrown as InstanceType<typeof PaymentReallocationError>).code).toBe(
      'AMOUNT_EXCEEDS_TOTAL_PAID',
    );

    const postSrc = await fetchEnrollment(pair.sourceEnrollmentId);
    const postTgt = await fetchEnrollment(pair.targetEnrollmentId);
    const postAuditCount = await countAuditPairsForAnchor(anchorId);

    expect(postSrc.totalPaid).toBe(preSrc.totalPaid);
    expect(postSrc.remainingBalance).toBe(preSrc.remainingBalance);
    expect(postSrc.paymentStatus).toBe(preSrc.paymentStatus);
    expect(postSrc.metadata).toEqual(preSrc.metadata);

    expect(postTgt.totalPaid).toBe(preTgt.totalPaid);
    expect(postTgt.remainingBalance).toBe(preTgt.remainingBalance);
    expect(postTgt.paymentStatus).toBe(preTgt.paymentStatus);
    expect(postTgt.metadata).toEqual(preTgt.metadata);

    expect(postAuditCount).toBe(0);
  });
});
