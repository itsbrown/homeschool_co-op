import express from 'express';
import { storage } from '../storage';

const router = express.Router();

interface RetentionUser {
  user: any;
  schoolId: number;
}

interface RetentionError {
  error: string;
  status: number;
}

async function getSchoolAdminWithFeatureCheck(req: any, featureName: string): Promise<RetentionUser | RetentionError> {
  const userEmail = req.user?.email || req.auth?.email;
  if (!userEmail) {
    return { error: 'Authentication required', status: 401 };
  }

  const user = await storage.getUserByEmail(userEmail);
  if (!user) {
    return { error: 'User not found', status: 404 };
  }

  const userRoles = await storage.getUserRolesByUserId(user.id);
  const hasAdminRole = userRoles.some(r =>
    r.role === 'schoolAdmin' || r.role === 'admin' || r.role === 'superAdmin'
  ) || user.role === 'schoolAdmin' || user.role === 'superAdmin';

  if (!hasAdminRole) {
    return { error: 'Only school administrators can access this report', status: 403 };
  }

  const adminRole = userRoles.find(r =>
    r.role === 'schoolAdmin' || r.role === 'admin' || r.role === 'superAdmin'
  );
  const schoolId = adminRole?.schoolId ?? user.schoolId;

  if (!schoolId) {
    return { error: 'No school associated with this admin account', status: 400 };
  }

  const features = await storage.getSchoolFeatures(schoolId);
  if (!features[featureName]) {
    return { error: 'This feature is not enabled for your school. Please contact support to upgrade.', status: 403 };
  }

  return { user, schoolId };
}

function isError(result: RetentionUser | RetentionError): result is RetentionError {
  return 'error' in result;
}

type FamilyRow = {
  parentEmail: string;
  parentName: string;
  childNames: string;
  inPeriod1: boolean;
  period1Classes: string[];
  inPeriod2: boolean;
  period2Classes: string[];
  status: 'Returning' | 'New' | 'Dropped';
};

async function buildRetentionData(schoolId: number, period1Start: string, period1End: string, period2Start: string, period2End: string) {
  const [period1Rows, period2Rows] = await Promise.all([
    storage.getEnrollmentFamiliesByPeriod(schoolId, period1Start, period1End),
    storage.getEnrollmentFamiliesByPeriod(schoolId, period2Start, period2End),
  ]);

  type FamilyData = {
    parentId: number;
    childNames: Set<string>;
    classNames: string[];
  };

  const period1Map = new Map<string, FamilyData>();
  for (const row of period1Rows) {
    const existing = period1Map.get(row.parentEmail);
    if (existing) {
      existing.childNames.add(row.childName);
      existing.classNames.push(row.className);
    } else {
      period1Map.set(row.parentEmail, {
        parentId: row.parentId,
        childNames: new Set([row.childName]),
        classNames: [row.className],
      });
    }
  }

  const period2Map = new Map<string, FamilyData>();
  for (const row of period2Rows) {
    const existing = period2Map.get(row.parentEmail);
    if (existing) {
      existing.childNames.add(row.childName);
      existing.classNames.push(row.className);
    } else {
      period2Map.set(row.parentEmail, {
        parentId: row.parentId,
        childNames: new Set([row.childName]),
        classNames: [row.className],
      });
    }
  }

  const allEmails = new Set([...period1Map.keys(), ...period2Map.keys()]);

  const parentIds = new Set<number>();
  for (const [, data] of period1Map) parentIds.add(data.parentId);
  for (const [, data] of period2Map) parentIds.add(data.parentId);

  const parentNameMap = new Map<number, string>();
  await Promise.all(
    Array.from(parentIds).map(async (id) => {
      try {
        const user = await storage.getUser(id);
        if (user) {
          parentNameMap.set(id, user.name || user.email);
        }
      } catch (_e) {}
    })
  );

  const rows: FamilyRow[] = [];

  for (const email of allEmails) {
    const p1 = period1Map.get(email);
    const p2 = period2Map.get(email);
    const inP1 = !!p1;
    const inP2 = !!p2;

    let status: 'Returning' | 'New' | 'Dropped';
    if (inP1 && inP2) {
      status = 'Returning';
    } else if (!inP1 && inP2) {
      status = 'New';
    } else {
      status = 'Dropped';
    }

    const parentId = p1?.parentId ?? p2?.parentId ?? 0;
    const parentName = parentNameMap.get(parentId) || email;

    const allChildNames = new Set<string>();
    if (p1) for (const n of p1.childNames) allChildNames.add(n);
    if (p2) for (const n of p2.childNames) allChildNames.add(n);

    rows.push({
      parentEmail: email,
      parentName,
      childNames: Array.from(allChildNames).sort().join(', '),
      inPeriod1: inP1,
      period1Classes: p1 ? Array.from(new Set(p1.classNames)).sort() : [],
      inPeriod2: inP2,
      period2Classes: p2 ? Array.from(new Set(p2.classNames)).sort() : [],
      status,
    });
  }

  const period1Total = period1Map.size;
  const period2Total = period2Map.size;
  const returningCount = rows.filter(r => r.status === 'Returning').length;
  const newCount = rows.filter(r => r.status === 'New').length;
  const droppedCount = rows.filter(r => r.status === 'Dropped').length;
  const returningPct = period1Total > 0 ? Math.round((returningCount / period1Total) * 100) : 0;

  return {
    summary: {
      returningCount,
      returningPct,
      newCount,
      droppedCount,
      period1Total,
      period2Total,
    },
    rows,
  };
}

router.get('/compare', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const { period1Start, period1End, period2Start, period2End } = req.query as Record<string, string>;
    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ error: 'period1Start, period1End, period2Start, period2End are required' });
    }

    const data = await buildRetentionData(schoolId, period1Start, period1End, period2Start, period2End);
    res.json(data);
  } catch (error) {
    console.error('Error fetching retention compare:', error);
    res.status(500).json({ error: 'Failed to fetch retention data' });
  }
});

router.get('/export', async (req: any, res) => {
  try {
    const result = await getSchoolAdminWithFeatureCheck(req, 'financialReports');
    if (isError(result)) {
      return res.status(result.status).json({ error: result.error });
    }
    const { schoolId } = result;

    const { period1Start, period1End, period2Start, period2End } = req.query as Record<string, string>;
    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ error: 'period1Start, period1End, period2Start, period2End are required' });
    }

    const data = await buildRetentionData(schoolId, period1Start, period1End, period2Start, period2End);

    const header = 'Parent Name,Parent Email,Child(ren),Period 1 Enrolled,Period 1 Classes,Period 2 Enrolled,Period 2 Classes,Status\n';
    const csvRows = data.rows.map(row => {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [
        escape(row.parentName),
        escape(row.parentEmail),
        escape(row.childNames),
        row.inPeriod1 ? 'Yes' : 'No',
        escape(row.period1Classes.join('; ')),
        row.inPeriod2 ? 'Yes' : 'No',
        escape(row.period2Classes.join('; ')),
        row.status,
      ].join(',');
    });

    const csv = header + csvRows.join('\n');
    const filename = `retention-report-${period1Start}-vs-${period2Start}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting retention CSV:', error);
    res.status(500).json({ error: 'Failed to export retention data' });
  }
});

export default router;
