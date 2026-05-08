// Integration tests for calculateCartSnapshot end-to-end (task #212).
//
// These tests exercise the FULL cart snapshot path against the real storage
// layer + dev database — they prove the server-authoritative membership line
// uses the unpaid membership_enrollments row's remaining balance instead of
// the school's full membershipFeeAmount when a partial payment exists.
//
// Companion evidence (raw snapshot JSON for each property) is written to
// docs/audit/212-evidence/ and embedded in the audit report.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { storage } from '../storage';
import { calculateCartSnapshot } from '../utils/cart-pricing';
import { getMembershipOutstandingBalance } from '../../client/src/utils/parentBalance';
import { getDb } from '../db';
import { users } from '../../shared/schema';
import type {
  InsertMembershipEnrollment,
  InsertSchool,
  MembershipEnrollment,
} from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

const TEST_PARENT_USER_ID = 999912;
const SCHOOL_ID = 1;
const FULL_FEE = 17500; // school's full membership fee in cents (17500 = $175.00)
const CURRENT_YEAR = new Date().getFullYear();
const EVIDENCE_DIR = join(process.cwd(), 'docs/audit/212-evidence');

function dump(name: string, payload: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
}

async function cleanupTestMemberships(): Promise<void> {
  const rows = await storage.getMembershipEnrollmentsByParentId(TEST_PARENT_USER_ID);
  for (const r of rows ?? []) {
    await storage.deleteMembershipEnrollment(r.id);
  }
}

async function ensureSchoolFee(): Promise<{
  originalFee: number | null;
  originalRequired: boolean | null;
}> {
  const school = await storage.getSchool(SCHOOL_ID);
  if (!school) throw new Error(`Test fixture school ${SCHOOL_ID} not found`);
  if (school.membershipFeeAmount !== FULL_FEE || !school.membershipRequired) {
    const update: Partial<InsertSchool> = {
      membershipFeeAmount: FULL_FEE,
      membershipRequired: true,
    };
    await storage.updateSchool(SCHOOL_ID, update);
  }
  return { originalFee: school.membershipFeeAmount, originalRequired: school.membershipRequired };
}

async function ensureTestParent(): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, TEST_PARENT_USER_ID));
  if (existing.length > 0) return;
  // Insert directly via the DB so the FK on membership_enrollments is satisfied.
  await db
    .insert(users)
    .values({
      id: TEST_PARENT_USER_ID,
      username: `task212-${TEST_PARENT_USER_ID}`,
      email: `task212-${TEST_PARENT_USER_ID}@test.local`,
      password: 'placeholder',
      role: 'parent',
      name: 'Task212 Test',
      firstName: 'Task212',
      lastName: 'Test',
      permissions: {},
    })
    .onConflictDoNothing();
  // Bump the users_id_seq above our synthetic ID to avoid future collisions.
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('users','id'),
                       GREATEST((SELECT MAX(id) FROM users), ${TEST_PARENT_USER_ID}))`);
}

async function deleteTestParent(): Promise<void> {
  const db = await getDb();
  await db.delete(users).where(eq(users.id, TEST_PARENT_USER_ID));
}

type MembershipOverrides = Partial<
  Pick<
    InsertMembershipEnrollment,
    'amount' | 'amountPaid' | 'remainingBalance' | 'balanceDue' | 'status' | 'membershipYear'
  >
>;

async function seedMembership(
  overrides: MembershipOverrides,
): Promise<MembershipEnrollment> {
  const base: InsertMembershipEnrollment = {
    schoolId: SCHOOL_ID,
    parentUserId: TEST_PARENT_USER_ID,
    membershipYear: CURRENT_YEAR,
    amount: FULL_FEE,
    amountPaid: 0,
    remainingBalance: FULL_FEE,
    totalAmount: FULL_FEE,
    balanceDue: FULL_FEE,
    status: 'pending_payment',
    dueDate: new Date(CURRENT_YEAR, 8, 1),
    endDate: new Date(CURRENT_YEAR + 1, 8, 1),
    expirationDate: new Date(CURRENT_YEAR + 1, 8, 1),
    startDate: new Date(CURRENT_YEAR, 8, 1),
    membershipTier: 'basic',
    notes: null,
    paymentMethod: null,
    gracePeriodEnd: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    renewalDate: null,
  };
  return storage.createMembershipEnrollment({ ...base, ...overrides });
}

let originalSchool: { originalFee: number | null; originalRequired: boolean | null };

beforeAll(async () => {
  originalSchool = await ensureSchoolFee();
  await ensureTestParent();
  await cleanupTestMemberships();
});

afterAll(async () => {
  await cleanupTestMemberships();
  await deleteTestParent();
  if (originalSchool && originalSchool.originalFee !== null) {
    const restore: Partial<InsertSchool> = {
      membershipFeeAmount: originalSchool.originalFee,
      membershipRequired: originalSchool.originalRequired ?? false,
    };
    await storage.updateSchool(SCHOOL_ID, restore);
  }
});

beforeEach(async () => {
  await cleanupTestMemberships();
});

describe('calculateCartSnapshot — membership balance source (task #212, integration)', () => {
  it('Property 1: partial-payment row → snapshot membershipTotal = row.remainingBalance (NOT school fee)', async () => {
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: 6000,
      remainingBalance: 4000,
      balanceDue: 4000,
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property1-partial-payment', { seededRow: seeded, snapshot });

    expect(snapshot.totals.membershipTotal).toBe(4000);
    expect(snapshot.totals.membershipTotal).not.toBe(FULL_FEE);
    expect(snapshot.totals.itemsTotal).toBe(0);
    expect(snapshot.totals.grandTotal).toBe(4000);
  });

  it('Property 2: first-time enrollment (no row) → snapshot membershipTotal = full school fee', async () => {
    // No seed — cleanup already removed any row.
    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property2-first-time', { seededRow: null, snapshot });

    expect(snapshot.totals.membershipTotal).toBe(FULL_FEE);
    expect(snapshot.totals.grandTotal).toBe(FULL_FEE);
  });

  it("Property 3: fully-paid row (status='enrolled') → snapshot membershipTotal = 0 (alreadyPaid short-circuit)", async () => {
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: FULL_FEE,
      remainingBalance: 0,
      balanceDue: 0,
      status: 'enrolled',
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property3-fully-paid', { seededRow: seeded, snapshot });

    expect(snapshot.totals.membershipTotal).toBe(0);
    expect(snapshot.totals.grandTotal).toBe(0);
  });

  it('Property 4: snapshot membershipTotal === UI getMembershipOutstandingBalance(row) — cent-for-cent', async () => {
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: 9500,
      remainingBalance: 8000,
      balanceDue: 8000,
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    const uiOutstandingBalanceCents = getMembershipOutstandingBalance(seeded);
    dump('property4-ui-parity', {
      seededRow: seeded,
      uiOutstandingBalanceCents,
      serverMembershipTotal: snapshot.totals.membershipTotal,
      serverGrandTotal: snapshot.totals.grandTotal,
      snapshot,
    });

    expect(uiOutstandingBalanceCents).toBe(8000);
    expect(snapshot.totals.membershipTotal).toBe(uiOutstandingBalanceCents);
    expect(snapshot.totals.grandTotal).toBe(uiOutstandingBalanceCents);
  });

  it('Property 5a: overpayment anomaly (remainingBalance < 0) → snapshot membershipTotal = 0 (NOT full fee)', async () => {
    // DB column is integer, negative is allowed.
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: 20000,
      remainingBalance: -2500,
      balanceDue: -2500,
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property5a-overpayment', { seededRow: seeded, snapshot });

    expect(snapshot.totals.membershipTotal).toBe(0);
    expect(snapshot.totals.membershipTotal).not.toBe(FULL_FEE);
    expect(snapshot.totals.grandTotal).toBe(0);
  });

  it('Property 5b: zero remaining (exact-paid pending row) → snapshot membershipTotal = 0', async () => {
    // remainingBalance = 0 BUT status still pending_payment. The active-membership
    // detection in calculateCartSnapshot treats remainingBalance<=0 as paid;
    // even if it didn't, the unpaid-row helper would return 0 — never the full fee.
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: FULL_FEE,
      remainingBalance: 0,
      balanceDue: 0,
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property5b-zero-remaining-pending', { seededRow: seeded, snapshot });

    expect(snapshot.totals.membershipTotal).toBe(0);
    expect(snapshot.totals.membershipTotal).not.toBe(FULL_FEE);
  });

  // Disputed-status edge case explicitly called out in code review.
  //
  // Product semantics (locked in shared/schema.ts via VALID_PAID_MEMBERSHIP_STATUSES
  // = ['enrolled','grace_period'] and isActiveMembership):
  //   "grace_period" = membership has expired but the parent is inside the
  //   renewal grace window. It COUNTS AS ACTIVE / PAID for the current year
  //   — the renewal is handled separately, NOT by re-adding the membership
  //   line to the cart. Re-charging here would double-charge the parent.
  //
  // This test locks that intentional behavior in so this task's change
  // (using row.remainingBalance for unpaid statuses) cannot accidentally
  // bleed over and start charging grace_period rows.
  //
  // NOTE on UI parity: `client/src/utils/parentBalance.ts` only skips
  // `expired`/`suspended` and would currently report a positive outstanding
  // balance for a grace_period row with remainingBalance>0. That is a
  // pre-existing UI helper inconsistency NOT introduced by this task and
  // NOT in scope here — it is captured as follow-up #243. The server
  // (cart pricing) is the authority for what the parent is actually charged
  // and correctly returns 0 in this state.
  it('Property 6 (disputed-status): grace_period row WITH positive remaining balance → snapshot membershipTotal = 0 (intentional, isActiveMembership=true)', async () => {
    const seeded = await seedMembership({
      amount: FULL_FEE,
      amountPaid: 5000,
      remainingBalance: 12500,
      balanceDue: 12500,
      status: 'grace_period',
    });

    const snapshot = await calculateCartSnapshot([], TEST_PARENT_USER_ID, SCHOOL_ID);
    dump('property6-grace-period-with-balance', { seededRow: seeded, snapshot });

    // Server: alreadyPaid=true short-circuit (status grace_period is active).
    expect(snapshot.totals.membershipTotal).toBe(0);
    expect(snapshot.totals.grandTotal).toBe(0);
    expect(snapshot.membership.alreadyPaid).toBe(true);
    // Crucially: server does NOT use the row's positive remaining balance
    // here — that path is reserved for unpaid statuses (pending_payment).
    expect(snapshot.totals.membershipTotal).not.toBe(seeded.remainingBalance);
    expect(snapshot.totals.membershipTotal).not.toBe(FULL_FEE);
  });
});
