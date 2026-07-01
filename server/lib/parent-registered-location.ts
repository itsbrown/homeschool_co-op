import type { IStorage } from '../storage';

export type RegisteredLocation = {
  locationId: number | null;
  locationName: string | null;
};

export async function resolveRegisteredLocation(
  storage: Pick<IStorage, 'getLocationById'>,
  locationId: number | null | undefined,
): Promise<RegisteredLocation> {
  if (!locationId) {
    return { locationId: null, locationName: null };
  }
  const location = await storage.getLocationById(locationId);
  return {
    locationId,
    locationName: location?.name ?? null,
  };
}

/**
 * Campus the family is registered with: parent profile location first,
 * then the child's stored locationId as a fallback.
 */
export async function resolveChildRegisteredLocation(
  storage: Pick<IStorage, 'getLocationById'>,
  parent: { locationId: number | null } | null | undefined,
  child: { locationId: number | null } | null | undefined,
): Promise<RegisteredLocation> {
  if (parent?.locationId) {
    return resolveRegisteredLocation(storage, parent.locationId);
  }
  return resolveRegisteredLocation(storage, child?.locationId ?? null);
}
