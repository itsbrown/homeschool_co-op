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

async function getSchoolAdminAuth(req: any): Promise<RetentionUser | RetentionError> {
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
    return { error: 'Only school administrators can access retention reports', status: 403 };
  }

  const adminRole = userRoles.find(r =>
    r.role === 'schoolAdmin' || r.role === 'admin' || r.role === 'superAdmin'
  );
  const schoolId = adminRole?.schoolId ?? user.schoolId;

  if (!schoolId) {
    return { error: 'No school associated with this admin account', status: 400 };
  }

  return { user, schoolId };
}

function isError(result: RetentionUser | RetentionError): result is RetentionError {
  return 'error' in result;
}

interface FamilyEntry {
  parentEmail: string;
  parentId: number;
  childNames: Set<string>;
  period1Classes: string[];
  period2Classes: string[];
}

async function computeRetentionData(schoolId: number, period1Start: string, period1End: string, period2Start: string, period2End: string) {
  const [period1Rows, period2Rows] = await Promise.all([
    storage.getEnrollmentFamiliesByPeriod(schoolId, period1Start, period1End),
    storage.getEnrollmentFamiliesByPeriod(schoolId, period2Start, period2End),
  ]);

  const period1Map = new Map<string, FamilyEntry>();
  for (const row of period1Rows) {
    const email = row.parentEmail.toLowerCase();
    if (!period1Map.has(email)) {
      period1Map.set(email, { parentEmail: email, parentId: row.parentId, childNames: new Set(), period1Classes: [], period2Classes: [] });
    }
    const entry = period1Map.get(email)!;
    if (row.childName) entry.childNames.add(row.childName);
    if (row.className && !entry.period1Classes.includes(row.className)) {
      entry.period1Classes.push(row.className);
    }
  }

  const period2Map = new Map<string, FamilyEntry>();
  for (const row of period2Rows) {
    const email = row.parentEmail.toLowerCase();
    if (!period2Map.has(email)) {
      period2Map.set(email, { parentEmail: email, parentId: row.parentId, childNames: new Set(), period1Classes: [], period2Classes: [] });
    }
    const entry = period2Map.get(email)!;
    if (row.childName) entry.childNames.add(row.childName);
    if (row.className && !entry.period2Classes.includes(row.className)) {
      entry.period2Classes.push(row.className);
    }
  }

  const period1Emails = new Set(period1Map.keys());
  const period2Emails = new Set(period2Map.keys());

  const returningEmails = new Set([...period1Emails].filter(e => period2Emails.has(e)));
  const newEmails = new Set([...period2Emails].filter(e => !period1Emails.has(e)));
  const droppedEmails = new Set([...period1Emails].filter(e => !period2Emails.has(e)));

  const returningCount = returningEmails.size;
  const newCount = newEmails.size;
  const droppedCount = droppedEmails.size;
  const period1Total = period1Emails.size;
  const period2Total = period2Emails.size;
  const returningPct = period1Total > 0 ? Math.round((returningCount / period1Total) * 100) : 0;

  const allEmails = new Set([...period1Emails, ...period2Emails]);

  const parentNameCache = new Map<number, string>();

  const rows = await Promise.all(
    Array.from(allEmails).map(async (email) => {
      const p1Entry = period1Map.get(email);
      const p2Entry = period2Map.get(email);
      const entry = p1Entry || p2Entry!;
      const parentId = entry.parentId;

      let parentName = email;
      if (!parentNameCache.has(parentId)) {
        try {
          const parentUser = await storage.getUser(parentId);
          parentName = parentUser?.name || parentUser?.email || email;
        } catch {
          parentName = email;
        }
        parentNameCache.set(parentId, parentName);
      } else {
        parentName = parentNameCache.get(parentId)!;
      }

      const childNamesSet = new Set<string>();
      if (p1Entry) p1Entry.childNames.forEach(n => childNamesSet.add(n));
      if (p2Entry) p2Entry.childNames.forEach(n => childNamesSet.add(n));

      let status: 'Returning' | 'New' | 'Dropped';
      if (returningEmails.has(email)) {
        status = 'Returning';
      } else if (newEmails.has(email)) {
        status = 'New';
      } else {
        status = 'Dropped';
      }

      return {
        parentEmail: email,
        parentName,
        childNames: Array.from(childNamesSet).join(', '),
        inPeriod1: !!p1Entry,
        period1Classes: p1Entry?.period1Classes ?? [],
        inPeriod2: !!p2Entry,
        period2Classes: p2Entry?.period2Classes ?? [],
        status,
      };
    })
  );

  return {
    summary: { returningCount, returningPct, newCount, droppedCount, period1Total, period2Total },
    rows,
  };
}

router.get('/compare', async (req: any, res) => {
  try {
    const auth = await getSchoolAdminAuth(req);
    if (isError(auth)) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const { schoolId } = auth;

    const { period1Start, period1End, period2Start, period2End } = req.query as Record<string, string>;
    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ error: 'All four date params are required: period1Start, period1End, period2Start, period2End' });
    }

    const data = await computeRetentionData(schoolId, period1Start, period1End, period2Start, period2End);
    res.json(data);
  } catch (error) {
    console.error('Error computing retention report:', error);
    res.status(500).json({ error: 'Failed to compute retention report' });
  }
});

router.get('/export', async (req: any, res) => {
  try {
    const auth = await getSchoolAdminAuth(req);
    if (isError(auth)) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const { schoolId } = auth;

    const { period1Start, period1End, period2Start, period2End } = req.query as Record<string, string>;
    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ error: 'All four date params are required' });
    }

    const data = await computeRetentionData(schoolId, period1Start, period1End, period2Start, period2End);
    const { summary, rows } = data;

    const lines: string[] = [];
    lines.push('Family Retention Report');
    lines.push(`Period 1,${period1Start} to ${period1End}`);
    lines.push(`Period 2,${period2Start} to ${period2End}`);
    lines.push('');
    lines.push('Summary');
    lines.push(`Period 1 Families,${summary.period1Total}`);
    lines.push(`Period 2 Families,${summary.period2Total}`);
    lines.push(`Returning Families,${summary.returningCount},${summary.returningPct}%`);
    lines.push(`New Families,${summary.newCount}`);
    lines.push(`Dropped Families,${summary.droppedCount}`);
    lines.push(`Retention Rate,${summary.returningPct}%`);
    lines.push('');
    lines.push('Parent Name,Parent Email,Child(ren),Period 1 Enrolled,Period 1 Classes,Period 2 Enrolled,Period 2 Classes,Status');

    for (const row of rows) {
      const p1Classes = row.period1Classes.join('; ');
      const p2Classes = row.period2Classes.join('; ');
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      lines.push([
        escape(row.parentName),
        escape(row.parentEmail),
        escape(row.childNames),
        row.inPeriod1 ? 'Yes' : 'No',
        escape(p1Classes),
        row.inPeriod2 ? 'Yes' : 'No',
        escape(p2Classes),
        row.status,
      ].join(','));
    }

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="retention-report-${period2Start}-${period2End}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting retention report:', error);
    res.status(500).json({ error: 'Failed to export retention report' });
  }
});

export default router;
