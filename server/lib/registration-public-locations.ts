import type { Request, Response } from 'express';
import {
  getPublicLocationsBySchoolId,
  type PublicLocationRow,
} from './location-db';
import { getSchoolCoreByRegistrationCode } from './school-db';
import { normalizeRegistrationCode } from './school-registration-code';

export type { PublicLocationRow };

/** Canonical path (mounted in server/index.ts before auth). */
export const PUBLIC_REGISTRATION_LOCATIONS_PATH = '/api/public/registration/locations';

/**
 * GET ?code=REGCODE or ?schoolId= — no auth; used by parent registration before login.
 * Prefer `code` so campuses always match the registration link school (not a stale client schoolId).
 * Mounted at PUBLIC_REGISTRATION_LOCATIONS_PATH and /api/locations/public (legacy).
 */
export async function handlePublicLocationsRequest(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const codeParam = req.query.code;
    const schoolIdParam = req.query.schoolId;

    let schoolId: number;

    if (codeParam != null && String(codeParam).trim() !== '') {
      const code = normalizeRegistrationCode(String(codeParam));
      const school = await getSchoolCoreByRegistrationCode(code);
      if (!school) {
        res.status(404).json({ message: 'School not found with this registration code' });
        return;
      }
      if (school.status !== 'active') {
        res.status(403).json({
          message:
            'This school is not currently accepting registrations. Please contact your administrator.',
        });
        return;
      }
      schoolId = school.id;
      console.log('🏢 [PUBLIC] Fetching locations for registration code:', code, 'schoolId:', schoolId);
    } else if (schoolIdParam != null && String(schoolIdParam).trim() !== '') {
      schoolId = parseInt(String(schoolIdParam), 10);
      if (isNaN(schoolId) || schoolId <= 0) {
        res.status(400).json({ message: 'Invalid school ID - must be a positive number' });
        return;
      }
      console.log('🏢 [PUBLIC] Fetching locations for school ID:', schoolId);
    } else {
      res.status(400).json({ message: 'Registration code or school ID is required' });
      return;
    }
    const locations = await getPublicLocationsBySchoolId(schoolId);

    if (locations.length === 0) {
      console.warn(
        `🏢 [PUBLIC] No active locations for school ${schoolId} — admin must add campuses in Location Management`,
      );
    }

    console.log('✅ [PUBLIC] Found locations:', locations.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(locations);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Error fetching public locations:', error);
    res.status(500).json({
      message: 'Failed to fetch locations',
      detail,
    });
  }
}
