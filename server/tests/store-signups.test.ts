import { describe, expect, it } from '@jest/globals';
import { buildStoreSignupsCsv, type StoreSignupRow } from '../lib/store-signups';

describe('buildStoreSignupsCsv', () => {
  it('includes child, parent, and emergency contact columns', () => {
    const rows: StoreSignupRow[] = [
      {
        id: 'enrollment-1',
        kind: 'program',
        enrollmentId: 1,
        storeOrderId: 7,
        orderNumber: '20260701-00007',
        orderStatus: 'paid',
        signedUpAt: '2026-07-01T12:00:00.000Z',
        programName: 'Trail Trekkers',
        programType: 'class',
        childName: 'Camp Kid',
        childBirthdate: '2015-06-01',
        childGrade: '4th Grade',
        parentName: 'Guest Parent',
        parentEmail: 'parent@test.com',
        parentPhone: '5555550100',
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '5555550199',
        emergencyContactRelationship: 'Aunt',
        enrollmentStatus: 'enrolled',
        waitlistPosition: null,
        totalCostCents: 5000,
        totalPaidCents: 5000,
        quantity: null,
      },
    ];

    const csv = buildStoreSignupsCsv(rows);
    expect(csv).toContain('Trail Trekkers');
    expect(csv).toContain('Camp Kid');
    expect(csv).toContain('parent@test.com');
    expect(csv).toContain('Emergency Contact');
    expect(csv).toContain('20260701-00007');
  });
});
