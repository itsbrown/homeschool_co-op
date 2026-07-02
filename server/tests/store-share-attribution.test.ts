import { resolveStoreShareReferral } from '../lib/store-share-attribution';
import { storage } from '../storage';

jest.mock('../storage', () => ({
  storage: {
    getUser: jest.fn(),
  },
}));

const mockGetUser = storage.getUser as jest.Mock;

describe('resolveStoreShareReferral', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it('returns null when referredByUserId is missing', async () => {
    await expect(
      resolveStoreShareReferral({ referredByUserId: undefined, buyerParentId: 1 }),
    ).resolves.toBeNull();
  });

  it('rejects self-referral', async () => {
    await expect(
      resolveStoreShareReferral({ referredByUserId: 5, buyerParentId: 5 }),
    ).resolves.toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns null when referrer user does not exist', async () => {
    mockGetUser.mockResolvedValue(undefined);
    await expect(
      resolveStoreShareReferral({ referredByUserId: 9, buyerParentId: 1 }),
    ).resolves.toBeNull();
  });

  it('returns referral metadata for a valid referrer', async () => {
    mockGetUser.mockResolvedValue({
      id: 9,
      firstName: 'Jamie',
      lastName: 'Lee',
      email: 'jamie@example.com',
    });

    const result = await resolveStoreShareReferral({
      referredByUserId: 9,
      buyerParentId: 1,
      capturedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result).toEqual({
      userId: 9,
      name: 'Jamie Lee',
      email: 'jamie@example.com',
      capturedAt: '2026-07-02T12:00:00.000Z',
    });
  });
});
