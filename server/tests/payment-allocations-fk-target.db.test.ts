/**
 * Task #246 regression test: payment_allocations.enrollment_id FK target.
 *
 * Proves the FK on payment_allocations.enrollment_id now references
 * program_enrollments(id) (the table every write site actually inserts),
 * not school_class_enrollments(id) (the original copy/paste hazard).
 *
 * Test 1: insert with a valid program_enrollments(id) succeeds and the
 *         join back to program_enrollments returns the same row.
 * Test 2: insert with a non-existent enrollment id is rejected by the FK
 *         with Postgres error code 23503.
 *
 * Talks to the live dev Postgres via getDb() — guarded so it skips on
 * minimal CI environments without DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

interface IdRow { id: number }

d('Task #246: payment_allocations.enrollment_id FK targets program_enrollments', () => {
  let createdSchoolId: number | null = null;
  let createdParentUserId: number | null = null;
  let createdChildId: number | null = null;
  let createdEnrollmentId: number | null = null;
  let createdHistoryId: number | null = null;
  let createdAllocationId: number | null = null;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('getDb() returned null');
    const tag = `t246_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    const userIns = (await db.execute(sql`
      INSERT INTO users (username, email, password, name, role)
      VALUES (${tag}, ${tag + '@test.local'}, 'x', ${tag}, 'parent')
      RETURNING id
    `)) as unknown as IdRow[];
    createdParentUserId = userIns[0].id;

    const schoolIns = (await db.execute(sql`
      INSERT INTO schools (name, type, admin_id, city, state, zip_code, email)
      VALUES (${'School ' + tag}, 'school', ${createdParentUserId}, 'Town', 'NY', '00000', ${tag + '@school.test'})
      RETURNING id
    `)) as unknown as IdRow[];
    createdSchoolId = schoolIns[0].id;

    const childIns = (await db.execute(sql`
      INSERT INTO children (parent_id, first_name, last_name, birthdate, grade_level)
      VALUES (${createdParentUserId}, 'Test', ${tag}, '2018-01-01', '2')
      RETURNING id
    `)) as unknown as IdRow[];
    createdChildId = childIns[0].id;

    const enrIns = (await db.execute(sql`
      INSERT INTO program_enrollments
        (school_id, class_type, child_id, child_name, class_name, parent_id, parent_email,
         total_cost, total_paid, remaining_balance)
      VALUES
        (${createdSchoolId}, 'school_class', ${createdChildId}, ${'Child ' + tag}, 'Test Class',
         ${createdParentUserId}, ${tag + '@test.local'}, 10000, 0, 10000)
      RETURNING id
    `)) as unknown as IdRow[];
    createdEnrollmentId = enrIns[0].id;

    const histIns = (await db.execute(sql`
      INSERT INTO stripe_payment_history
        (user_id, payment_intent_id, customer_id, amount, currency, status, source, stripe_created_at)
      VALUES
        (${createdParentUserId}, ${'pi_' + tag}, ${'cus_' + tag}, 10000, 'usd', 'succeeded', 'manual', NOW())
      RETURNING id
    `)) as unknown as IdRow[];
    createdHistoryId = histIns[0].id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdAllocationId !== null) {
      await db.execute(sql`DELETE FROM payment_allocations WHERE id = ${createdAllocationId}`);
    }
    if (createdHistoryId !== null) {
      await db.execute(sql`DELETE FROM stripe_payment_history WHERE id = ${createdHistoryId}`);
    }
    if (createdEnrollmentId !== null) {
      await db.execute(sql`DELETE FROM program_enrollments WHERE id = ${createdEnrollmentId}`);
    }
    if (createdChildId !== null) {
      await db.execute(sql`DELETE FROM children WHERE id = ${createdChildId}`);
    }
    if (createdSchoolId !== null) {
      await db.execute(sql`DELETE FROM schools WHERE id = ${createdSchoolId}`);
    }
    if (createdParentUserId !== null) {
      await db.execute(sql`DELETE FROM users WHERE id = ${createdParentUserId}`);
    }
  });

  it('FK target is program_enrollments (not school_class_enrollments)', async () => {
    const db = await getDb();
    const rows = (await db.execute(sql`
      SELECT ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'payment_allocations'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name = 'payment_allocations_enrollment_id_fkey'
    `)) as unknown as Array<{ referenced_table: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].referenced_table).toBe('program_enrollments');
  });

  it('inserts with a valid program_enrollments(id) and joins back correctly', async () => {
    const db = await getDb();
    const ins = (await db.execute(sql`
      INSERT INTO payment_allocations
        (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type)
      VALUES
        (${createdHistoryId}, ${createdEnrollmentId}, 5000, 'payment')
      RETURNING id
    `)) as unknown as IdRow[];
    expect(ins.length).toBe(1);
    createdAllocationId = ins[0].id;

    const joined = (await db.execute(sql`
      SELECT pa.id AS allocation_id, pa.allocated_amount_cents, pe.id AS enrollment_id, pe.class_name
      FROM payment_allocations pa
      JOIN program_enrollments pe ON pe.id = pa.enrollment_id
      WHERE pa.id = ${createdAllocationId}
    `)) as unknown as Array<{
      allocation_id: number;
      allocated_amount_cents: number;
      enrollment_id: number;
      class_name: string;
    }>;
    expect(joined.length).toBe(1);
    expect(joined[0].enrollment_id).toBe(createdEnrollmentId);
    expect(joined[0].allocated_amount_cents).toBe(5000);
    expect(joined[0].class_name).toBe('Test Class');
  });

  it('rejects an insert with a non-existent enrollment id (FK violation 23503)', async () => {
    const db = await getDb();
    const bogusId = 2_000_000_000; // far above any plausible serial value
    let caught: any = null;
    try {
      await db.execute(sql`
        INSERT INTO payment_allocations
          (payment_history_id, enrollment_id, allocated_amount_cents, allocation_type)
        VALUES
          (${createdHistoryId}, ${bogusId}, 1000, 'payment')
      `);
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const code = caught?.code ?? caught?.cause?.code;
    const msg = String(caught?.message || '');
    // postgres-js surfaces SQLSTATE 23503 either via .code or in the message text
    const isFkViolation =
      code === '23503' ||
      /violates foreign key constraint/i.test(msg) ||
      /payment_allocations_enrollment_id_fkey/.test(msg);
    expect(isFkViolation).toBe(true);
  });
});
