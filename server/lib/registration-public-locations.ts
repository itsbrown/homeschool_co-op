import type { Request, Response } from 'express';
import { storage } from '../storage';
import { getSchoolCoreById } from './school-db';

export type PublicLocationRow = { id: number; name: string };

/**
 * GET /api/locations/public?schoolId=
 * No auth — used by parent registration before login.
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
    let locations = await storage.getLocationsBySchoolId(schoolId);

    if (locations.length === 0) {
      const school = await getSchoolCoreById(schoolId);
      if (school) {
        console.log(
          `🏢 [PUBLIC] No locations for school ${schoolId} — creating default Main Campus`,
        );
        try {
          const created = await storage.createLocation({
            schoolId,
            name: 'Main Campus',
            code: 'MAIN',
            address: school.address || 'TBD',
            city: school.city,
            state: school.state,
            zipCode: school.zipCode,
            isActive: true,
          });
          locations = [created];
        } catch (createErr) {
          console.error('[PUBLIC] Failed to auto-create default location:', createErr);
        }
      }
    }

    console.log('✅ [PUBLIC] Found locations:', locations.length);

    const publicLocations: PublicLocationRow[] = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
    }));

    res.json(publicLocations);
  } catch (error) {
    console.error('Error fetching public locations:', error);
    res.status(500).json({ message: 'Failed to fetch locations' });
  }
}
