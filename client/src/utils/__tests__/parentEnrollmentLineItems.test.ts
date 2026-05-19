import { describe, it, expect } from '@jest/globals';
import { filterEnrollmentsToCartLineItems } from '../parentEnrollmentLineItems';

describe('filterEnrollmentsToCartLineItems', () => {
  it('keeps one line per class+child (latest enrollment wins)', () => {
    const enrollments = [
      {
        id: 1,
        classId: 10,
        childId: 5,
        enrollmentDate: '2024-01-01',
        status: 'pending_payment',
        effectiveBalance: 100,
      },
      {
        id: 2,
        classId: 10,
        childId: 5,
        enrollmentDate: '2025-06-01',
        status: 'pending_payment',
        effectiveBalance: 200,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
  });

  it('drops group when a fully paid enrollment exists in the group', () => {
    const enrollments = [
      {
        id: 1,
        classId: 10,
        childId: 5,
        enrollmentDate: '2025-01-01',
        status: 'enrolled',
        paymentStatus: 'completed',
        effectiveBalance: 0,
      },
      {
        id: 2,
        classId: 10,
        childId: 5,
        enrollmentDate: '2024-01-01',
        status: 'pending_payment',
        effectiveBalance: 500,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(0);
  });

  it('keeps separate lines per session for the same child', () => {
    const enrollments = [
      {
        id: 1,
        sessionId: 100,
        childId: 5,
        enrollmentDate: '2025-01-01',
        status: 'pending_payment',
        effectiveBalance: 15000,
      },
      {
        id: 2,
        sessionId: 101,
        childId: 5,
        enrollmentDate: '2025-02-01',
        status: 'pending_payment',
        effectiveBalance: 25000,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id).sort()).toEqual([1, 2]);
  });
});
