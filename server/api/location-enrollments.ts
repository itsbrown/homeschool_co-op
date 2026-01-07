import { Router } from 'express';
import { getDb } from '../db';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireLocationPermission } from '../middleware/locationPermissions';
import { piiRateLimit } from '../middleware/piiRateLimit';
import { 
  programEnrollments, 
  children, 
  users, 
  schoolClasses,
  locations,
  piiAccessLogs,
  type InsertPiiAccessLog
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

const router = Router();

interface EnrollmentWithParentContact {
  enrollmentId: number;
  studentId: number;
  studentFirstName: string;
  studentLastName: string;
  studentFullName: string;
  className: string;
  classId: number;
  enrollmentStatus: string;
  parentId: number;
  parentName: string;
  parentEmail: string;
  parentPhone: string | null;
  enrollmentDate: Date | null;
}

async function logPiiAccess(
  userId: number,
  locationId: number,
  schoolId: number | null,
  accessType: InsertPiiAccessLog['accessType'],
  resourceType: InsertPiiAccessLog['resourceType'],
  resourceIds: number[],
  req: any
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(piiAccessLogs).values({
      userId,
      locationId,
      schoolId,
      accessType,
      resourceType,
      resourceIds,
      recordCount: resourceIds.length,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      requestPath: req.originalUrl || req.path || null,
    });
  } catch (error) {
    console.error('Failed to log PII access:', error);
  }
}

router.get(
  '/:locationId/enrollments',
  supabaseAuth,
  piiRateLimit('location-enrollments'),
  requireLocationPermission('canViewParentContacts'),
  async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const locationId = parseInt(req.params.locationId);
      const userId = req.user.id;

      if (isNaN(locationId)) {
        return res.status(400).json({ error: 'Invalid location ID' });
      }

      const db = await getDb();

      const locationResult = await db.select()
        .from(locations)
        .where(eq(locations.id, locationId))
        .limit(1);

      if (locationResult.length === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const location = locationResult[0];

      const enrollmentResults = await db
        .select({
          enrollmentId: programEnrollments.id,
          studentId: programEnrollments.childId,
          studentFirstName: children.firstName,
          studentLastName: children.lastName,
          className: schoolClasses.title,
          classId: programEnrollments.classId,
          enrollmentStatus: programEnrollments.status,
          parentId: users.id,
          parentName: users.name,
          parentEmail: users.email,
          parentPhone: users.phone,
          enrollmentDate: programEnrollments.enrollmentDate,
        })
        .from(programEnrollments)
        .innerJoin(children, eq(programEnrollments.childId, children.id))
        .innerJoin(users, eq(children.parentId, users.id))
        .innerJoin(schoolClasses, eq(programEnrollments.classId, schoolClasses.id))
        .where(
          and(
            eq(schoolClasses.locationId, locationId),
            inArray(programEnrollments.status, ['enrolled', 'pending_payment', 'pending_admin_approval', 'waitlist'])
          )
        );

      const enrollments: EnrollmentWithParentContact[] = enrollmentResults.map((row: typeof enrollmentResults[0]) => ({
        enrollmentId: row.enrollmentId,
        studentId: row.studentId,
        studentFirstName: row.studentFirstName,
        studentLastName: row.studentLastName,
        studentFullName: `${row.studentFirstName} ${row.studentLastName}`,
        className: row.className,
        classId: row.classId!,
        enrollmentStatus: row.enrollmentStatus,
        parentId: row.parentId,
        parentName: row.parentName,
        parentEmail: row.parentEmail,
        parentPhone: row.parentPhone,
        enrollmentDate: row.enrollmentDate,
      }));

      await logPiiAccess(
        userId,
        locationId,
        location.schoolId,
        'view_parent_contacts',
        'enrollment',
        enrollments.map(e => e.enrollmentId),
        req
      );

      res.json({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
        },
        enrollments,
        meta: {
          totalCount: enrollments.length,
          accessedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching location enrollments:', error);
      res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
  }
);

router.get(
  '/:locationId/enrollments/summary',
  supabaseAuth,
  requireLocationPermission('canViewReports'),
  async (req, res) => {
    try {
      const locationId = parseInt(req.params.locationId);

      if (isNaN(locationId)) {
        return res.status(400).json({ error: 'Invalid location ID' });
      }

      const db = await getDb();

      const locationResult = await db.select()
        .from(locations)
        .where(eq(locations.id, locationId))
        .limit(1);

      if (locationResult.length === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const location = locationResult[0];

      const enrollmentCounts = await db
        .select({
          status: programEnrollments.status,
        })
        .from(programEnrollments)
        .innerJoin(schoolClasses, eq(programEnrollments.classId, schoolClasses.id))
        .where(eq(schoolClasses.locationId, locationId));

      const statusCounts: Record<string, number> = {};
      for (const row of enrollmentCounts) {
        statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
      }

      res.json({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
        },
        summary: {
          totalEnrollments: enrollmentCounts.length,
          byStatus: statusCounts,
        },
      });
    } catch (error) {
      console.error('Error fetching enrollment summary:', error);
      res.status(500).json({ error: 'Failed to fetch enrollment summary' });
    }
  }
);

export default router;
