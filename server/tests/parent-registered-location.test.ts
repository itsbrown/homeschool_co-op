import {
  resolveChildRegisteredLocation,
  resolveRegisteredLocation,
} from '../lib/parent-registered-location';

describe('parent-registered-location', () => {
  const storage = {
    getLocationById: jest.fn(async (id: number) => {
      if (id === 1) return { id: 1, name: 'Brighton' };
      if (id === 2) return { id: 2, name: 'Greece' };
      return undefined;
    }),
  };

  it('resolveRegisteredLocation returns name when location exists', async () => {
    await expect(resolveRegisteredLocation(storage, 1)).resolves.toEqual({
      locationId: 1,
      locationName: 'Brighton',
    });
  });

  it('resolveRegisteredLocation returns nulls when no location id', async () => {
    await expect(resolveRegisteredLocation(storage, null)).resolves.toEqual({
      locationId: null,
      locationName: null,
    });
  });

  it('resolveChildRegisteredLocation prefers parent location', async () => {
    await expect(
      resolveChildRegisteredLocation(storage, { locationId: 1 }, { locationId: 2 }),
    ).resolves.toEqual({
      locationId: 1,
      locationName: 'Brighton',
    });
  });

  it('resolveChildRegisteredLocation falls back to child location', async () => {
    await expect(
      resolveChildRegisteredLocation(storage, { locationId: null }, { locationId: 2 }),
    ).resolves.toEqual({
      locationId: 2,
      locationName: 'Greece',
    });
  });
});
