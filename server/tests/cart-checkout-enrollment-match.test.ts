import { describe, expect, it } from '@jest/globals';
import { findProgramEnrollmentForCartItem } from '../lib/cart-checkout-enrollment-match';

describe('findProgramEnrollmentForCartItem', () => {
  const rows = [
    {
      id: 1,
      childId: 10,
      programId: null,
      classId: null,
      marketplaceClassId: 500,
      status: 'pending_payment',
    },
    {
      id: 2,
      childId: 20,
      programId: 300,
      classId: null,
      marketplaceClassId: null,
      status: 'pending_payment',
    },
  ];

  it('matches by enrollmentId first', () => {
    const hit = findProgramEnrollmentForCartItem(rows, {
      enrollmentId: 2,
      childId: 99,
      classId: 999,
    });
    expect(hit?.id).toBe(2);
  });

  it('matches marketplace enrollment via item.marketplaceClassId', () => {
    const hit = findProgramEnrollmentForCartItem(rows, {
      childId: 10,
      marketplaceClassId: 500,
    });
    expect(hit?.id).toBe(1);
  });

  it('matches legacy programId column', () => {
    const hit = findProgramEnrollmentForCartItem(rows, {
      childId: 20,
      programId: 300,
    });
    expect(hit?.id).toBe(2);
  });

  it('returns undefined when no row matches', () => {
    const hit = findProgramEnrollmentForCartItem(rows, {
      childId: 10,
      classId: 404,
    });
    expect(hit).toBeUndefined();
  });

  it('matches F001 session enrollment by sessionId when class ids are null', () => {
    const sessionRows = [
      {
        id: 99,
        childId: 10,
        sessionId: 7,
        programId: null,
        classId: null,
        marketplaceClassId: null,
        status: 'pending_payment',
      },
    ];
    const hit = findProgramEnrollmentForCartItem(sessionRows, {
      childId: 10,
      sessionId: 7,
      classType: 'marketplace',
      marketplaceClassId: null,
      classId: null,
    });
    expect(hit?.id).toBe(99);
  });

  it('matches by enrollmentId when id is a numeric string in JSON payloads', () => {
    const hit = findProgramEnrollmentForCartItem(rows, {
      enrollmentId: '2' as unknown as number,
      childId: 99,
    });
    expect(hit?.id).toBe(2);
  });
});
