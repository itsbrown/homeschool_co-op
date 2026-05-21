import type { Request, Response } from 'express';
import { getSchoolCoreById } from './school-db';
import {
  createDefaultLocationForSchool,
  getPublicLocationsBySchoolId,
  type PublicLocationRow,
} from './location-db';

export type { PublicLocationRow };

/** Canonical path (mounted in server/index.ts before auth). */
export const PUBLIC_REGISTRATION_LOCATIONS_PATH = '/api/public/registration/locations';

/**
 * GET ?schoolId= — no auth; used by parent registration before login.
 * Mounted at PUBLIC_REGISTRATION_LOCATIONS_PATH and /api/locations/public (legacy).
 */
export async function handlePublicLocationsRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const schoolIdParam = req.query.schoolId;

    if (!schoolIdParam) {
      res.status(400).json({ message: 'School ID is required' });
      return;
    }

    const schoolId = parseInt(String(schoolIdParam), 10);
    if (isNaN(schoolId) || schoolId <= 0) {
      res.status(400).json({ message: 'Invalid school ID - must be a positive number' });
      return;
    }

    console.log('🏢 [PUBLIC] Fetching locations for school ID:', schoolId);
    let locations = await getPublicLocationsBySchoolId(schoolId);

    if (locations.length === 0) {
      const school = await getSchoolCoreById(schoolId);
      if (school) {
        console.log(
          `🏢 [PUBLIC] No locations for school ${schoolId} — creating default Main Campus`,
        );
        const created = await createDefaultLocationForSchool(school);
        locations = [created];
      }
    }

    console.log('✅ [PUBLIC] Found locations:', locations.length);
    res.json(locations);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Error fetching public locations:', error);
    res.status(500).json({
      message: 'Failed to fetch locations',
      ...(process.env.NODE_ENV !== 'production' && { detail }),
    });
  }
}
