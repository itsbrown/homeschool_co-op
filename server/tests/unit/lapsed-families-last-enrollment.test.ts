/**
 * Lapsed families report: last enrollment date storage + retention wiring.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, beforeEach } from '@jest/globals';
import { MemStorage } from '../../storage';
import type { InsertProgramEnrollment } from '@shared/schema';

const retentionSource = readFileSync(join(__dirname, '../../api/retention.ts'), 'utf8');
const dbStorageSource = readFileSync(join(__dirname, '../../dbStorage.ts'), 'utf8');
const storageInterfaceSource = readFileSync(join(__dirname, '../../storage.ts'), 'utf8');

function baseEnrollment(
  overrides: Partial<InsertProgramEnrollment> & Pick<InsertProgramEnrollment, 'parentEmail'>,
): InsertProgramEnrollment {
  return {
    schoolId: 1,
    childId: 1,
    childName: 'Child',
    className: 'Class A',
    parentId: 1,
    parentEmail: overrides.parentEmail,
    totalCost: 10000,
    remainingBalance: 0,
    status: 'enrolled',
    enrollmentDate: new Date('2023-01-15'),
    ...overrides,
  } as InsertProgramEnrollment;
}

describe('lapsed families last enrollment date', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('retention report calls batch last-enrollment lookup', () => {
    expect(retentionSource).toContain('getLastEnrollmentDateByParentEmails');
    expect(retentionSource).toContain('lastEnrollmentByEmail.get(email)');
  });

  it('storage interface and dbStorage define getLastEnrollmentDateByParentEmails', () => {
    expect(storageInterfaceSource).toContain('getLastEnrollmentDateByParentEmails');
    expect(dbStorageSource).toContain('getLastEnrollmentDateByParentEmails');
    expect(dbStorageSource).toContain('GREATEST');
  });

  it('returns max GREATEST(enrollment_date, program_start_date) per normalized email', async () => {
    await storage.createProgramEnrollment(
      baseEnrollment({
        parentEmail: ' Parent@Example.COM ',
        enrollmentDate: new Date('2022-06-01'),
        programStartDate: '2022-09-01',
        status: 'completed',
      }),
    );
    await storage.createProgramEnrollment(
      baseEnrollment({
        parentEmail: 'parent@example.com',
        enrollmentDate: new Date('2024-01-10'),
        programStartDate: '2023-08-15',
        status: 'enrolled',
      }),
    );
    await storage.createProgramEnrollment(
      baseEnrollment({
        parentEmail: 'other@school.com',
        enrollmentDate: new Date('2025-01-01'),
        status: 'enrolled',
      }),
    );
    await storage.createProgramEnrollment(
      baseEnrollment({
        parentEmail: 'cancelled@school.com',
        enrollmentDate: new Date('2020-01-01'),
        status: 'cancelled',
      }),
    );

    const map = await storage.getLastEnrollmentDateByParentEmails(1, [
      'parent@example.com',
      'cancelled@school.com',
    ]);

    expect(map.get('parent@example.com')).toBe('2024-01-10');
    expect(map.has('cancelled@school.com')).toBe(false);
    expect(map.has('other@school.com')).toBe(false);
  });

  it('returns empty map when no emails provided', async () => {
    const map = await storage.getLastEnrollmentDateByParentEmails(1, []);
    expect(map.size).toBe(0);
  });
});
