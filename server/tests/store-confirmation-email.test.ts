import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../storage', () => ({
  storage: {
    updateSchoolDocument: jest.fn(async () => ({})),
  },
}));

jest.mock('../lib/store-storage', () => ({
  updateStoreOrder: jest.fn(async () => ({})),
}));

jest.mock('../lib/store-documents', () => ({
  resolveStoreDeliveryDocuments: jest.fn(async () => []),
}));

jest.mock('../lib/email-service', () => ({
  sendStorePurchaseConfirmationEmail: jest.fn(async () => true),
}));

describe('sendStoreOrderConfirmationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when confirmation email was already sent', async () => {
    const { sendStorePurchaseConfirmationEmail } = await import('../lib/email-service');
    const { sendStoreOrderConfirmationEmail } = await import('../lib/store-confirmation-email');

    const sent = await sendStoreOrderConfirmationEmail({
      schoolId: 1,
      storeSlug: 'test-school',
      storeOrder: {
        id: 42,
        accessToken: 'tok',
        totalCents: 5000,
        createdAt: '2026-07-01T12:00:00.000Z',
        metadata: { confirmationEmailSentAt: '2026-07-01T12:01:00.000Z' },
      },
      snapshotPayload: { lines: [], childAssignments: [] },
      parentEmail: 'parent@test.com',
      parentName: 'Test Parent',
      paidEnrollments: [],
      waitlistEnrollments: [],
    });

    expect(sent).toBe(true);
    expect(sendStorePurchaseConfirmationEmail).not.toHaveBeenCalled();
  });

  it('sends email with formatted order number and confirmation URL', async () => {
    const { sendStorePurchaseConfirmationEmail } = await import('../lib/email-service');
    const { sendStoreOrderConfirmationEmail } = await import('../lib/store-confirmation-email');

    await sendStoreOrderConfirmationEmail({
      schoolId: 1,
      storeSlug: 'american-seekers-academy',
      storeOrder: {
        id: 7,
        accessToken: 'abc123',
        totalCents: 5000,
        createdAt: new Date('2026-07-01T15:00:00.000Z'),
        metadata: {},
      },
      snapshotPayload: {
        childAssignments: [{ lineId: 'line_1', childId: 1, firstName: 'Camp', lastName: 'Kid' }],
        lines: [{ lineId: 'line_1', title: 'Trail Trekkers', listingType: 'class', lineTotalCents: 5000 }],
      },
      parentEmail: 'parent@test.com',
      parentName: 'Guest Parent',
      paidEnrollments: [
        {
          enrollmentId: 99,
          status: 'active',
          line: {
            lineId: 'line_1',
            title: 'Trail Trekkers',
            listingType: 'class',
            sourceId: 1,
            lineTotalCents: 5000,
            fulfillment: 'paid',
          },
        },
      ],
      waitlistEnrollments: [],
    });

    expect(sendStorePurchaseConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent@test.com',
        orderNumber: '20260701-00007',
        confirmationUrl: expect.stringContaining('/store/american-seekers-academy/success?token=abc123'),
        paidLines: [
          expect.objectContaining({
            title: 'Trail Trekkers',
            childName: 'Camp Kid',
            lineTotalCents: 5000,
          }),
        ],
      }),
    );
  });
});

describe('ensureDeliveryDocumentShareTokens', () => {
  it('creates share token when missing', async () => {
    const { storage } = await import('../storage');
    const { ensureDeliveryDocumentShareTokens } = await import('../lib/store-confirmation-email');

    const tokens = await ensureDeliveryDocumentShareTokens([{ id: 5, shareToken: null }]);

    expect(storage.updateSchoolDocument).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ shareToken: expect.any(String) }),
    );
    expect(tokens.get(5)).toEqual(expect.any(String));
  });
});
