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

  it('keeps separate v2 session lines when sessionId is missing but dayType is set', () => {
    const enrollments = [
      {
        id: 10,
        enrollmentVersion: 'v2',
        dayType: 'full_day',
        variantId: 'full_day',
        childId: 5,
        className: 'Fall 2026 - Full Day',
        enrollmentDate: '2026-05-19',
        status: 'pending_payment',
        effectiveBalance: 150000,
      },
      {
        id: 11,
        enrollmentVersion: 'v2',
        dayType: 'full_day',
        variantId: 'full_day',
        childId: 5,
        className: 'Winter 2027 - Full Day',
        enrollmentDate: '2026-05-19',
        status: 'pending_payment',
        effectiveBalance: 150000,
      },
      {
        id: 12,
        enrollmentVersion: 'v2',
        dayType: 'full_day',
        variantId: 'full_day',
        childId: 5,
        className: 'Spring 2027 - Full Day',
        enrollmentDate: '2026-05-19',
        status: 'pending_payment',
        effectiveBalance: 150000,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.id).sort()).toEqual([10, 11, 12]);
  });

  it('includes pending_payment when effectiveBalance is 0 but totalCost is still owed', () => {
    const enrollments = [
      {
        id: 30,
        enrollmentVersion: 'v2',
        sessionId: 200,
        variantId: 'full_day',
        childId: 5,
        className: 'Fall 2026 - Full Day',
        enrollmentDate: '2026-05-28',
        status: 'pending_payment',
        totalCost: 150000,
        totalPaid: 0,
        effectiveBalance: 0,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(30);
  });

  it('does not collapse v2 sessions that share a legacy marketplaceClassId', () => {
    const enrollments = [
      {
        id: 20,
        enrollmentVersion: 'v2',
        sessionId: 100,
        marketplaceClassId: 999,
        variantId: 'full_day',
        childId: 5,
        enrollmentDate: '2026-05-19',
        status: 'pending_payment',
        effectiveBalance: 150000,
      },
      {
        id: 21,
        enrollmentVersion: 'v2',
        sessionId: 101,
        marketplaceClassId: 999,
        variantId: 'full_day',
        childId: 5,
        enrollmentDate: '2026-05-19',
        status: 'pending_payment',
        effectiveBalance: 150000,
      },
    ];
    const out = filterEnrollmentsToCartLineItems(enrollments);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id).sort()).toEqual([20, 21]);
  });
});
