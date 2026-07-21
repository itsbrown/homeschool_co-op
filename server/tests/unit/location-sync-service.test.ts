import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const syncUserLocationForSchool = jest.fn(async () => undefined);

type Row = Record<string, unknown>;

function createDbMock(opts: {
  locationRows: Row[];
  userRows: Row[];
  childRows: Row[];
}) {
  let selectCall = 0;
  const db = {
    select: jest.fn(() => {
      selectCall += 1;
      const call = selectCall;
      const chain: any = {
        from: jest.fn(() => chain),
        where: jest.fn(() => {
          // getParentChildIds has no .limit()
          if (call === 3) {
            return Promise.resolve(opts.childRows);
          }
          return chain;
        }),
        limit: jest.fn(async () => {
          if (call === 1) return opts.locationRows;
          if (call === 2) return opts.userRows;
          return [];
        }),
      };
      return chain;
    }),
    update: jest.fn(() => {
      const chain: any = {
        set: jest.fn(() => chain),
        where: jest.fn(async () => undefined),
      };
      return chain;
    }),
    insert: jest.fn(() => {
      const chain: any = {
        values: jest.fn(() => chain),
        returning: jest.fn(async () => [{ id: 1 }]),
      };
      return chain;
    }),
  };
  return db;
}

jest.mock('../../db', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../lib/sync-user-location-for-school', () => ({
  syncUserLocationForSchool: (...args: unknown[]) => syncUserLocationForSchool(...args),
}));

import { getDb } from '../../db';
import { updateParentLocation } from '../../services/locationSyncService';

describe('updateParentLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects location that does not belong to the school', async () => {
    const db = createDbMock({ locationRows: [], userRows: [], childRows: [] });
    (getDb as jest.Mock).mockResolvedValue(db);

    const result = await updateParentLocation(135, 999, {
      actorId: 1,
      actorEmail: 'admin@example.com',
      actorRole: 'schoolAdmin',
      schoolId: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not belong/i);
    expect(syncUserLocationForSchool).not.toHaveBeenCalled();
  });

  it('updates parent, syncs user_locations, and cascades to children', async () => {
    const db = createDbMock({
      locationRows: [{ id: 4, schoolId: 2, name: 'Greece' }],
      userRows: [{ id: 135, locationId: 3, email: 'parent@example.com' }],
      childRows: [{ childId: 169 }],
    });
    (getDb as jest.Mock).mockResolvedValue(db);

    const result = await updateParentLocation(135, 4, {
      actorId: 1,
      actorEmail: 'admin@example.com',
      actorRole: 'schoolAdmin',
      schoolId: 2,
    });

    expect(result).toEqual({
      success: true,
      parentUpdated: true,
      childrenUpdated: 1,
    });
    expect(syncUserLocationForSchool).toHaveBeenCalledWith(135, 2, 4);
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});
