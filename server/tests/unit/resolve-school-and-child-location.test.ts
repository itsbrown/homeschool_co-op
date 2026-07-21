import { describe, expect, it, jest } from '@jest/globals';
import { resolveSchoolAndChildLocation } from '../../lib/parent-child-registration';

describe('resolveSchoolAndChildLocation', () => {
  it('returns preferred campus when it belongs to the school', async () => {
    const storage = {
      getSchool: jest.fn(async () => ({ id: 1, name: 'ASA' })),
      getLocationsBySchoolId: jest.fn(async () => [
        { id: 3, name: 'Brighton' },
        { id: 4, name: 'Greece' },
      ]),
    } as any;

    const result = await resolveSchoolAndChildLocation(storage, 1, 4);
    expect(result).toEqual({ validSchoolId: 1, locationId: 4 });
  });

  it('does not default to the first campus when preferred is missing', async () => {
    const storage = {
      getSchool: jest.fn(async () => ({ id: 1, name: 'ASA' })),
      getLocationsBySchoolId: jest.fn(async () => [
        { id: 3, name: 'Brighton' },
        { id: 4, name: 'Greece' },
      ]),
    } as any;

    const result = await resolveSchoolAndChildLocation(storage, 1, null);
    expect(result).toEqual({ validSchoolId: 1, locationId: null });
  });

  it('returns null locationId for invalid preferred campus', async () => {
    const storage = {
      getSchool: jest.fn(async () => ({ id: 1, name: 'ASA' })),
      getLocationsBySchoolId: jest.fn(async () => [{ id: 3, name: 'Brighton' }]),
    } as any;

    const result = await resolveSchoolAndChildLocation(storage, 1, 999);
    expect(result).toEqual({ validSchoolId: 1, locationId: null });
  });
});
