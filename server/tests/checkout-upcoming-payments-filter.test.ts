import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getEnrollmentById = jest.fn();

jest.mock('../storage', () => ({
  storage: {
    getEnrollmentById,
    getAllEnrollments: jest.fn(),
    getPaymentByStripeId: jest.fn(),
  },
}));

import { filterScheduledPaymentsUntilFirstPaid } from '../lib/checkout-upcoming-payments';

describe('filterScheduledPaymentsUntilFirstPaid', () => {
  beforeEach(() => {
    getEnrollmentById.mockReset();
  });

  it('keeps installment 1 when enrollment totalPaid is still 0 (remaining-balance schedules)', async () => {
    getEnrollmentById.mockResolvedValue({
      id: 394,
      totalPaid: 0,
    } as never);

    const rows = [
      {
        id: 557,
        enrollmentId: 394,
        installmentNumber: 1,
        totalInstallments: 1,
        status: 'pending',
        metadata: { enrollmentIds: [394] },
      },
    ];

    const kept = await filterScheduledPaymentsUntilFirstPaid(rows);
    expect(kept.map((r) => r.id)).toEqual([557]);
    expect(getEnrollmentById).not.toHaveBeenCalled();
  });

  it('hides installments 2+ until the bundle has collected a first payment', async () => {
    getEnrollmentById.mockResolvedValue({
      id: 394,
      totalPaid: 0,
    } as never);

    const rows = [
      {
        id: 10,
        enrollmentId: 394,
        installmentNumber: 2,
        totalInstallments: 4,
        status: 'pending',
        metadata: { enrollmentIds: [394] },
      },
    ];

    const kept = await filterScheduledPaymentsUntilFirstPaid(rows);
    expect(kept).toEqual([]);
  });

  it('shows installments 2+ after totalPaid > 0', async () => {
    getEnrollmentById.mockResolvedValue({
      id: 394,
      totalPaid: 12500,
    } as never);

    const rows = [
      {
        id: 10,
        enrollmentId: 394,
        installmentNumber: 2,
        totalInstallments: 4,
        status: 'pending',
        metadata: { enrollmentIds: [394] },
      },
    ];

    const kept = await filterScheduledPaymentsUntilFirstPaid(rows);
    expect(kept.map((r) => r.id)).toEqual([10]);
  });
});
