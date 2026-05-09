/**
 * Regression tests for the allocator reallocation math (Task #201).
 *
 * Locks in two pieces of logic that have no other automated coverage:
 *   1. The proportional reallocation planner — the **real** function exported
 *      from `scripts/lib/computeReallocationPlan.ts`, which is the same module
 *      `scripts/fix-allocator-data-corruption.ts` imports and runs against
 *      production data. A regression in the script's planner therefore breaks
 *      this suite immediately.
 *   2. `PaymentReallocationService` input validation and mid-write rollback
 *      atomicity — exercised through the real service entry points with the
 *      DB layer mocked via `jest.unstable_mockModule` (the only mocking API
 *      that intercepts ESM imports under the project's
 *      `--experimental-vm-modules` jest config).
 *
 * The companion test `server/tests/allocator-reallocation-atomicity.db.test.ts`
 * provides the true Postgres-backed atomicity proof (post-failure SELECT shows
 * source/target unchanged); this file covers all the pure-logic and
 * service-validation branches.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { computeReallocationPlan } from '../../scripts/lib/computeReallocationPlan';
import type { MoveSpec } from '../services/PaymentReallocationService';

interface AffectedEnrollmentRow {
  enrollment_id: number;
  total_cost: number;
  total_paid: number;
  comp_amount_cents: number | null;
  effective_balance: number;
  status: string | null;
}

interface AffectedParentSummary {
  parent_id: number;
  enrollments: AffectedEnrollmentRow[];
  overpaymentCents: number;
  underpaymentCents: number;
  netCents: number;
  pureAllocatorBugVictim: boolean;
}

function enrollment(
  id: number,
  totalCost: number,
  totalPaid: number,
  effectiveBalance: number,
  status = 'enrolled',
): AffectedEnrollmentRow {
  return {
    enrollment_id: id,
    total_cost: totalCost,
    total_paid: totalPaid,
    comp_amount_cents: 0,
    effective_balance: effectiveBalance,
    status,
  };
}

function summary(enrollments: AffectedEnrollmentRow[]): AffectedParentSummary {
  let over = 0;
  let under = 0;
  let net = 0;
  for (const e of enrollments) {
    net += e.effective_balance;
    if (e.effective_balance < 0) over += -e.effective_balance;
    if (e.effective_balance > 0) under += e.effective_balance;
  }
  return {
    parent_id: 1,
    enrollments,
    overpaymentCents: over,
    underpaymentCents: under,
    netCents: net,
    pureAllocatorBugVictim: net === 0 && over > 0 && under > 0,
  };
}

// ===========================================================================
// Mock the DB layer — typed, no `any`. ESM mocking requires
// `jest.unstable_mockModule` (the classic `jest.mock` does not intercept
// imports under our `--experimental-vm-modules` jest config).
// ===========================================================================

interface LockedEnrollmentRow {
  id: number;
  parent_id: number | null;
  total_cost: number;
  total_paid: number;
  comp_amount_cents: number | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
}

interface ExecutedSqlCall {
  kind: 'SELECT' | 'UPDATE' | 'INSERT' | 'OTHER';
  sqlSnippet: string;
}

type ExecuteFn = (query: unknown) => Promise<unknown>;
type TxCallback<T> = (tx: { execute: ExecuteFn }) => Promise<T>;
type TransactionFn = <T>(cb: TxCallback<T>) => Promise<T>;

const mockExecute = jest.fn<ExecuteFn>();
const mockTransaction = jest.fn<TransactionFn>(async (cb) => cb({ execute: mockExecute }));
const executedCalls: ExecutedSqlCall[] = [];

function classifySql(query: unknown): ExecutedSqlCall {
  const text = JSON.stringify(query ?? '');
  // Order matters: SELECT … FOR UPDATE contains the substring "UPDATE", so we
  // must classify SELECTs before pattern-matching UPDATE.
  if (/\bSELECT\b/.test(text)) return { kind: 'SELECT', sqlSnippet: text.slice(0, 80) };
  if (/UPDATE program_enrollments/.test(text))
    return { kind: 'UPDATE', sqlSnippet: text.slice(0, 80) };
  if (/INSERT INTO/.test(text)) return { kind: 'INSERT', sqlSnippet: text.slice(0, 80) };
  return { kind: 'OTHER', sqlSnippet: text.slice(0, 80) };
}

jest.unstable_mockModule('../db', () => ({
  getDb: jest.fn(async () => ({
    execute: (q: unknown) => mockExecute(q),
    transaction: (cb: TxCallback<unknown>) => mockTransaction(cb),
  })),
  db: {},
  pool: {},
}));

// Dynamic import AFTER the mock is registered so ESM picks up the mocked module.
const { PaymentReallocationService } = await import('../services/PaymentReallocationService');

// ===========================================================================
// Property 1: Sara Puccia's exact six-enrollment scenario (parent #55)
// Source: scripts/reports/allocator-investigation-2538aef4-c7d2-497a-9af0-209ff6543e66.md
// ===========================================================================
describe('computeReallocationPlan — Sara Puccia (parent #55) byte-perfect scenario', () => {
  // Cents-precision fixture (cost / paid / effective_balance):
  //   187: 90000  / 134000 / -44000  (Sebastian — Tycoons, overpaid $440)
  //   188: 90000  / 134000 / -44000  (Salena — Tycoons, overpaid $440)
  //   191: 30000  / 66000  / -36000  (Silvie — Macaronis, overpaid $360)
  //   299: 30000  / 30000  /     0   (Silvie — Macaronis Wed, balanced)
  //   381: 130000 / 68000  /  62000  (Sebastian — Tycoons new, owes $620)
  //   382: 130000 / 68000  /  62000  (Salena — Tycoons new, owes $620)
  // Per-parent net = 0; total over/under = $1,240 = 124000¢
  const sara: AffectedParentSummary = summary([
    enrollment(187, 90000, 134000, -44000),
    enrollment(188, 90000, 134000, -44000),
    enrollment(191, 30000, 66000, -36000),
    enrollment(299, 30000, 30000, 0),
    enrollment(381, 130000, 68000, 62000),
    enrollment(382, 130000, 68000, 62000),
  ]);

  it('produces exactly 6 reallocations summing to $124,000 cents (124000)', () => {
    const plan = computeReallocationPlan(sara);
    expect(plan).toHaveLength(6);
    const total = plan.reduce((s, m) => s + m.amountCents, 0);
    expect(total).toBe(124000);
  });

  it('lands all five affected enrollments at effective_balance = 0', () => {
    const plan = computeReallocationPlan(sara);
    const finalBalance = new Map<number, number>();
    for (const e of sara.enrollments) {
      finalBalance.set(e.enrollment_id, e.effective_balance);
    }
    for (const m of plan) {
      finalBalance.set(
        m.sourceEnrollmentId,
        (finalBalance.get(m.sourceEnrollmentId) ?? 0) + m.amountCents,
      );
      finalBalance.set(
        m.targetEnrollmentId,
        (finalBalance.get(m.targetEnrollmentId) ?? 0) - m.amountCents,
      );
    }
    expect(finalBalance.get(187)).toBe(0);
    expect(finalBalance.get(188)).toBe(0);
    expect(finalBalance.get(191)).toBe(0);
    expect(finalBalance.get(299)).toBe(0);
    expect(finalBalance.get(381)).toBe(0);
    expect(finalBalance.get(382)).toBe(0);
  });

  it('matches the documented per-move table from the investigation report', () => {
    const plan = computeReallocationPlan(sara);
    expect(plan).toEqual([
      { sourceEnrollmentId: 187, targetEnrollmentId: 381, amountCents: 22000 },
      { sourceEnrollmentId: 187, targetEnrollmentId: 382, amountCents: 22000 },
      { sourceEnrollmentId: 188, targetEnrollmentId: 381, amountCents: 22000 },
      { sourceEnrollmentId: 188, targetEnrollmentId: 382, amountCents: 22000 },
      { sourceEnrollmentId: 191, targetEnrollmentId: 381, amountCents: 18000 },
      { sourceEnrollmentId: 191, targetEnrollmentId: 382, amountCents: 18000 },
    ]);
  });
});

// ===========================================================================
// Property 2: Sums to exact total under floor-division stress
// ===========================================================================
describe('computeReallocationPlan — sums-to-exact-total under floor-division stress', () => {
  const cases = [
    {
      name: '$100 overpayment split across 3 unequal underpayments (33/33/34)',
      overs: [enrollment(1, 100, 200, -100)],
      unders: [
        enrollment(10, 100, 67, 33),
        enrollment(11, 100, 67, 33),
        enrollment(12, 100, 66, 34),
      ],
      expectedTotal: 100,
    },
    {
      name: '$1.01 (101¢) overpayment split across 7 underpayments',
      overs: [enrollment(1, 0, 101, -101)],
      unders: [
        enrollment(10, 100, 0, 14),
        enrollment(11, 100, 0, 14),
        enrollment(12, 100, 0, 14),
        enrollment(13, 100, 0, 15),
        enrollment(14, 100, 0, 15),
        enrollment(15, 100, 0, 14),
        enrollment(16, 100, 0, 15),
      ],
      expectedTotal: 101,
    },
    {
      name: 'two overs ($7 + $11 = $18) split across two unequal unders ($5 + $13)',
      overs: [enrollment(1, 0, 7, -7), enrollment(2, 0, 11, -11)],
      unders: [enrollment(10, 100, 95, 5), enrollment(11, 100, 87, 13)],
      expectedTotal: 18,
    },
    {
      name: 'awkward primes: $97 over → 3 unders ($31, $33, $33)',
      overs: [enrollment(1, 0, 97, -97)],
      unders: [
        enrollment(10, 100, 69, 31),
        enrollment(11, 100, 67, 33),
        enrollment(12, 100, 67, 33),
      ],
      expectedTotal: 97,
    },
    {
      name: 'big real-world sums: $1240 over (3 sources) → 2 unders ($620 each)',
      overs: [
        enrollment(1, 0, 440, -440),
        enrollment(2, 0, 440, -440),
        enrollment(3, 0, 360, -360),
      ],
      unders: [enrollment(10, 1300, 680, 620), enrollment(11, 1300, 680, 620)],
      expectedTotal: 1240,
    },
  ];

  for (const c of cases) {
    it(`${c.name} sums exactly to ${c.expectedTotal} with zero off-by-one`, () => {
      const plan = computeReallocationPlan(summary([...c.overs, ...c.unders]));
      const sum = plan.reduce((s, m) => s + m.amountCents, 0);
      expect(sum).toBe(c.expectedTotal);
      for (const m of plan) {
        expect(Number.isInteger(m.amountCents)).toBe(true);
        expect(m.amountCents).toBeGreaterThan(0);
      }
      const remaining = new Map(c.unders.map((u) => [u.enrollment_id, u.effective_balance]));
      for (const m of plan) {
        remaining.set(
          m.targetEnrollmentId,
          (remaining.get(m.targetEnrollmentId) ?? 0) - m.amountCents,
        );
      }
      for (const [, bal] of remaining) {
        expect(bal).toBe(0);
      }
    });
  }
});

// ===========================================================================
// Property 3: Defensive empty-plan return when net != 0
// ===========================================================================
describe('computeReallocationPlan — returns empty when per-parent net != 0', () => {
  it('returns [] when overpayment > underpayment (net negative)', () => {
    const p = summary([enrollment(1, 0, 500, -500), enrollment(2, 100, 0, 100)]);
    expect(p.netCents).toBe(-400);
    expect(computeReallocationPlan(p)).toEqual([]);
  });

  it('returns [] when underpayment > overpayment (net positive)', () => {
    const p = summary([enrollment(1, 0, 100, -100), enrollment(2, 500, 0, 500)]);
    expect(p.netCents).toBe(400);
    expect(computeReallocationPlan(p)).toEqual([]);
  });

  it('returns [] when there are no overpaid enrollments', () => {
    expect(computeReallocationPlan(summary([enrollment(1, 100, 50, 50)]))).toEqual([]);
  });

  it('returns [] when there are no underpaid enrollments', () => {
    expect(computeReallocationPlan(summary([enrollment(1, 0, 50, -50)]))).toEqual([]);
  });
});

// ===========================================================================
// Property 4: PaymentReallocationService input validation
// ===========================================================================
describe('PaymentReallocationService — input validation rejections', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockTransaction.mockClear();
    executedCalls.length = 0;
    mockTransaction.mockImplementation(async (cb) => cb({ execute: mockExecute }));
  });

  const baseInput = {
    sourceEnrollmentId: 1,
    targetEnrollmentId: 2,
    amountCents: 100,
    adminComment: 'unit test',
  };

  it('rejects same-source-and-target (single reallocate)', async () => {
    await expect(
      PaymentReallocationService.reallocate({
        ...baseInput,
        sourceEnrollmentId: 5,
        targetEnrollmentId: 5,
      }),
    ).rejects.toMatchObject({
      name: 'PaymentReallocationError',
      code: 'SAME_SOURCE_AND_TARGET',
    });
  });

  it('rejects same-source-and-target (batch reallocateMany)', async () => {
    await expect(
      PaymentReallocationService.reallocateMany({
        parentId: 1,
        moves: [{ sourceEnrollmentId: 5, targetEnrollmentId: 5, amountCents: 100 }],
        snapshot: new Map(),
        adminCommentBuilder: () => 'x',
      }),
    ).rejects.toMatchObject({ code: 'SAME_SOURCE_AND_TARGET' });
  });

  it('rejects zero amount', async () => {
    await expect(
      PaymentReallocationService.reallocate({ ...baseInput, amountCents: 0 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_INVALID' });
  });

  it('rejects negative amount', async () => {
    await expect(
      PaymentReallocationService.reallocate({ ...baseInput, amountCents: -50 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_INVALID' });
  });

  it('rejects non-integer amount', async () => {
    await expect(
      PaymentReallocationService.reallocate({ ...baseInput, amountCents: 50.5 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_INVALID' });
  });

  it('rejects empty admin comment', async () => {
    await expect(
      PaymentReallocationService.reallocate({ ...baseInput, adminComment: '   ' }),
    ).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
  });

  it('rejects amount > source totalPaid (caught inside transaction, after FOR UPDATE lock)', async () => {
    const lockedRows: LockedEnrollmentRow[] = [
      {
        id: 1,
        parent_id: 99,
        total_cost: 10000,
        total_paid: 50, // less than the 100¢ move
        comp_amount_cents: 0,
        status: 'enrolled',
        metadata: null,
      },
      {
        id: 2,
        parent_id: 99,
        total_cost: 10000,
        total_paid: 0,
        comp_amount_cents: 0,
        status: 'enrolled',
        metadata: null,
      },
    ];
    let execCall = 0;
    mockExecute.mockImplementation(async (query) => {
      execCall += 1;
      executedCalls.push(classifySql(query));
      if (execCall === 1) return lockedRows;
      if (execCall === 2) return [{ payment_history_id: 12345 }];
      return [];
    });

    await expect(
      PaymentReallocationService.reallocateMany({
        parentId: 99,
        moves: [{ sourceEnrollmentId: 1, targetEnrollmentId: 2, amountCents: 100 }],
        snapshot: new Map(),
        adminCommentBuilder: () => 'unit test amount exceeds',
      }),
    ).rejects.toMatchObject({ code: 'AMOUNT_EXCEEDS_TOTAL_PAID' });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // The throw escaped *inside* the transaction (the FOR UPDATE SELECT was
    // observed as the first SQL call) — proving the service doesn't decide
    // amount-exceeds outside the locked tx.
    expect(executedCalls[0]?.kind).toBe('SELECT');
  });
});

// ===========================================================================
// Property 5: Mid-write atomicity — writes happen, then a per-move
// validation in the *write loop* throws, and the throw escapes the
// transaction callback so the documented Postgres ROLLBACK contract aborts
// every write that was issued before the throw.
// ===========================================================================
describe('PaymentReallocationService — mid-write atomicity (rollback after partial writes)', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockTransaction.mockClear();
    executedCalls.length = 0;
  });

  it('aborts the transaction callback after move #1 has issued writes when move #2 violates an in-loop check', async () => {
    // Two-move batch: move #1 is fully valid and will issue
    //   UPDATE program_enrollments (source) → UPDATE program_enrollments (target)
    //   → INSERT payment_allocations (out) → INSERT payment_allocations (in)
    // Move #2 has amountCents > working[src2].total_paid, which is checked
    // INSIDE the per-move loop AFTER move #1's writes (see
    // server/services/PaymentReallocationService.ts L431-447 — `if
    // (move.amountCents > src.total_paid) throw AMOUNT_EXCEEDS_TOTAL_PAID`).
    //
    // We assert:
    //   1. Move #1's 4 write SQLs (2× UPDATE + 2× INSERT) were issued.
    //   2. Move #2 issued ZERO writes.
    //   3. The throw escaped the `db.transaction(cb)` callback — proving the
    //      service does NOT swallow mid-write errors. Postgres' transactional
    //      contract (cited at server/services/PaymentReallocationService.ts L301
    //      `return db.transaction(async (tx) => { ... })`) guarantees the
    //      ROLLBACK that physically reverses move #1's writes; the service's
    //      job is to let the throw escape, which this test verifies.
    let throwEscapedTransaction = false;

    mockTransaction.mockImplementation(async (cb) => {
      try {
        return await cb({ execute: mockExecute });
      } catch (err) {
        throwEscapedTransaction = true;
        throw err;
      }
    });

    const lockedRows: LockedEnrollmentRow[] = [
      // Move #1 source (enrollment 1): valid, has 5000¢ paid
      { id: 1, parent_id: 99, total_cost: 10000, total_paid: 5000, comp_amount_cents: 0, status: 'enrolled', metadata: null },
      // Move #1 target (enrollment 2): underpaid, can absorb the move
      { id: 2, parent_id: 99, total_cost: 10000, total_paid: 0, comp_amount_cents: 0, status: 'enrolled', metadata: null },
      // Move #2 source (enrollment 3): only 100¢ paid → can't satisfy a 5000¢ move
      { id: 3, parent_id: 99, total_cost: 10000, total_paid: 100, comp_amount_cents: 0, status: 'enrolled', metadata: null },
      // Move #2 target (enrollment 4)
      { id: 4, parent_id: 99, total_cost: 10000, total_paid: 0, comp_amount_cents: 0, status: 'enrolled', metadata: null },
    ];

    let execCall = 0;
    mockExecute.mockImplementation(async (query) => {
      execCall += 1;
      const call = classifySql(query);
      executedCalls.push(call);
      // Call 1: SELECT … FOR UPDATE (the row lock)
      if (execCall === 1) return lockedRows;
      // Call 2: audit-anchor SELECT (returns a fake anchor so the write path
      // can proceed to the INSERTs).
      if (execCall === 2) return [{ payment_history_id: 12345 }];
      // INSERTs need to return a row with an id (RETURNING id) so the audit
      // pair sequencing succeeds.
      if (call.kind === 'INSERT') return [{ id: 9000 + execCall }];
      return [];
    });

    await expect(
      PaymentReallocationService.reallocateMany({
        parentId: 99,
        moves: [
          { sourceEnrollmentId: 1, targetEnrollmentId: 2, amountCents: 1000 },
          { sourceEnrollmentId: 3, targetEnrollmentId: 4, amountCents: 5000 },
        ],
        snapshot: new Map(),
        adminCommentBuilder: () => 'mid-write rollback unit test',
      }),
    ).rejects.toMatchObject({
      code: 'AMOUNT_EXCEEDS_TOTAL_PAID',
      details: expect.objectContaining({
        sourceEnrollmentId: 3,
        sourceTotalPaid: 100,
        amountCents: 5000,
      }),
    });

    // Property 5a: the transaction was opened exactly once, and the throw
    // escaped its callback — Postgres rollback contract applies.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(throwEscapedTransaction).toBe(true);

    // Property 5b: move #1's writes were actually issued before the throw.
    // We expect: 1 SELECT (lock) + 1 SELECT (anchor) + 2 UPDATE (move #1
    // src+tgt) + 2 INSERT (move #1 out+in audit pair) = 6 calls before the
    // mid-loop throw. Move #2 issues ZERO writes because its in-loop check
    // throws before any tx.execute.
    const updates = executedCalls.filter((c) => c.kind === 'UPDATE');
    const inserts = executedCalls.filter((c) => c.kind === 'INSERT');
    expect(updates.length).toBe(2); // move #1 source + target
    expect(inserts.length).toBe(2); // move #1 audit pair (out, in)
    // No third UPDATE / third INSERT — move #2 never reached the writers.
    expect(updates.length + inserts.length).toBe(4);
  });

  it('aborts immediately with zero writes when DRIFT_DETECTED fires before the write loop', async () => {
    // Defensive test: drift detection runs *before* the write loop, so the
    // expected outcome is a clean abort with no UPDATE/INSERT issued at all.
    let throwEscapedTransaction = false;
    mockTransaction.mockImplementation(async (cb) => {
      try {
        return await cb({ execute: mockExecute });
      } catch (err) {
        throwEscapedTransaction = true;
        throw err;
      }
    });

    const lockedRows: LockedEnrollmentRow[] = [
      { id: 1, parent_id: 99, total_cost: 10000, total_paid: 5000, comp_amount_cents: 0, status: 'enrolled', metadata: null },
      { id: 2, parent_id: 99, total_cost: 10000, total_paid: 0, comp_amount_cents: 0, status: 'enrolled', metadata: null },
    ];
    mockExecute.mockImplementation(async (query) => {
      executedCalls.push(classifySql(query));
      if (executedCalls.length === 1) return lockedRows;
      return [];
    });

    const snapshot = new Map([
      [
        1,
        {
          totalPaid: 9999, // mismatch vs locked 5000
          totalCost: 10000,
          compAmountCents: 0,
          status: 'enrolled',
          effectiveBalance: 1,
        },
      ],
    ]);

    await expect(
      PaymentReallocationService.reallocateMany({
        parentId: 99,
        moves: [{ sourceEnrollmentId: 1, targetEnrollmentId: 2, amountCents: 100 }],
        snapshot,
        adminCommentBuilder: () => 'drift abort unit test',
      }),
    ).rejects.toMatchObject({ code: 'DRIFT_DETECTED' });

    expect(throwEscapedTransaction).toBe(true);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(executedCalls.filter((c) => c.kind === 'UPDATE')).toEqual([]);
    expect(executedCalls.filter((c) => c.kind === 'INSERT')).toEqual([]);
  });
});
