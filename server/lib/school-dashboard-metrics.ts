/**
 * Pure My School overview math. Loaders in load-school-dashboard-metrics.ts
 * supply school-scoped rows; this file does not touch the database.
 */
import { computeEffectiveBalance } from '@shared/schema';
import { normalizeEmailForLookup } from '@shared/parent-identity';

export type SessionWindow = {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
};

export type DashboardEnrollment = {
  childId: number;
  parentEmail: string;
  status: string;
  sessionId: number | null;
  classSessionId: number | null;
  enrollmentDate: string | null;
  programEndDate: string | null;
};

export type DashboardClass = {
  id: number;
  status: string;
  endDate: string | null;
  sessionId: number | null;
};

const CURRENT_STUDENT_STATUSES = new Set([
  'enrolled',
  'pending_admin_approval',
  'pending_payment',
]);

const ACTIVE_STUDENT_STATUSES = new Set(['enrolled', 'pending_admin_approval']);

/** Matches class-list seat count, plus pending admin approval (on the roster). */
export const CLASS_SEAT_STATUSES = new Set([
  'pending_payment',
  'enrolled',
  'waitlist',
  'completed',
  'pending_admin_approval',
]);

const NEW_STUDENT_EXCLUDED = new Set(['cancelled', 'withdrawn', 'failed']);

const RETENTION_EXCLUDED = new Set(['cancelled', 'withdrawn', 'failed']);

const FAMILY_ROLES = new Set(['parent', 'student', 'learner']);

const INSTRUCTOR_ROLES = new Set([
  'educator',
  'teacher',
  'mentor',
  'instructor',
  'aide',
]);

const BALANCE_EXCLUDED = new Set([
  'cancelled',
  'waitlist',
  'withdrawn',
  'failed',
  'completed',
]);

export type EnrollmentDashboardMetrics = {
  totalStudents: number;
  activeStudents: number;
  newEnrollments: number;
  enrollmentGrowth: number | null;
  retentionRate: number | null;
};

export type AcademicClassMetrics = {
  activeClasses: number;
  totalClasses: number;
  avgClassSize: number;
};

export type StaffDashboardMetrics = {
  totalStaff: number;
  activeInstructors: number;
  pendingInvites: number;
  staffUtilization: number | null;
};

export type FinancialDashboardMetrics = {
  totalRevenue: number;
  outstandingBalance: number;
  collectionRate: number | null;
  avgTuitionPaid: number;
  monthlyRevenue: number;
  unpaidAccounts: number;
};

export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** In-progress term. Later upcoming terms (winter while fall is active) stay out. */
export function selectCurrentSessions(sessions: SessionWindow[], today: string): SessionWindow[] {
  const open = sessions.filter(
    (s) => s.status !== 'cancelled' && s.status !== 'completed' && s.endDate >= today,
  );
  const inProgress = open.filter(
    (s) => s.status === 'active' || (s.startDate <= today && s.endDate >= today),
  );
  if (inProgress.length > 0) return inProgress;

  const upcoming = open
    .filter((s) => s.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length === 0) return [];
  const nextMonth = monthKey(upcoming[0].startDate);
  return upcoming.filter((s) => monthKey(s.startDate) === nextMonth);
}

/** Completed sessions that ended in the latest month before the current term starts. */
export function selectPreviousSessions(
  sessions: SessionWindow[],
  current: SessionWindow[],
): SessionWindow[] {
  if (current.length === 0) return [];
  const currentStart = current.reduce(
    (min, s) => (s.startDate < min ? s.startDate : min),
    current[0].startDate,
  );
  const ended = sessions.filter(
    (s) => s.status !== 'cancelled' && s.endDate < currentStart,
  );
  if (ended.length === 0) return [];
  const latestEnd = ended.reduce(
    (max, s) => (s.endDate > max ? s.endDate : max),
    ended[0].endDate,
  );
  const month = monthKey(latestEnd);
  return ended.filter((s) => monthKey(s.endDate) === month);
}

function inSessionSet(
  enrollment: DashboardEnrollment,
  sessionIds: Set<number>,
): boolean {
  if (enrollment.sessionId != null && sessionIds.has(enrollment.sessionId)) return true;
  if (enrollment.classSessionId != null && sessionIds.has(enrollment.classSessionId)) return true;
  return false;
}

function isCurrentTermEnrollment(
  enrollment: DashboardEnrollment,
  currentIds: Set<number>,
  today: string,
): boolean {
  const status = enrollment.status.toLowerCase();
  if (!CURRENT_STUDENT_STATUSES.has(status)) return false;
  if (currentIds.size > 0) return inSessionSet(enrollment, currentIds);
  if (enrollment.programEndDate == null) return true;
  return enrollment.programEndDate >= today;
}

export function computeRetentionRate(
  previousEmails: string[],
  currentEmails: string[],
): number | null {
  const previous = new Set(
    previousEmails.map((e) => normalizeEmailForLookup(e)).filter(Boolean),
  );
  if (previous.size === 0) return null;
  const current = new Set(
    currentEmails.map((e) => normalizeEmailForLookup(e)).filter(Boolean),
  );
  let kept = 0;
  for (const email of previous) {
    if (current.has(email)) kept += 1;
  }
  return round1((kept / previous.size) * 100);
}

export function buildEnrollmentMetrics(input: {
  today: string;
  sessions: SessionWindow[];
  enrollments: DashboardEnrollment[];
}): EnrollmentDashboardMetrics {
  const currentSessions = selectCurrentSessions(input.sessions, input.today);
  const previousSessions = selectPreviousSessions(input.sessions, currentSessions);
  const currentIds = new Set(currentSessions.map((s) => s.id));
  const previousIds = new Set(previousSessions.map((s) => s.id));

  const activeChildren = new Set<number>();
  const termChildren = new Set<number>();
  for (const enrollment of input.enrollments) {
    if (!isCurrentTermEnrollment(enrollment, currentIds, input.today)) continue;
    termChildren.add(enrollment.childId);
    if (ACTIVE_STUDENT_STATUSES.has(enrollment.status.toLowerCase())) {
      activeChildren.add(enrollment.childId);
    }
  }

  const firstDateByChild = new Map<number, string>();
  for (const enrollment of input.enrollments) {
    if (NEW_STUDENT_EXCLUDED.has(enrollment.status.toLowerCase())) continue;
    if (!enrollment.enrollmentDate) continue;
    const existing = firstDateByChild.get(enrollment.childId);
    if (!existing || enrollment.enrollmentDate < existing) {
      firstDateByChild.set(enrollment.childId, enrollment.enrollmentDate);
    }
  }

  const thisStart = shiftIsoDate(input.today, -30);
  const prevStart = shiftIsoDate(input.today, -60);
  let newStudents = 0;
  let previousWindow = 0;
  for (const firstDate of firstDateByChild.values()) {
    if (firstDate >= thisStart && firstDate <= input.today) newStudents += 1;
    else if (firstDate >= prevStart && firstDate < thisStart) previousWindow += 1;
  }

  const previousEmails: string[] = [];
  const currentEmails: string[] = [];
  if (previousIds.size > 0) {
    for (const enrollment of input.enrollments) {
      if (RETENTION_EXCLUDED.has(enrollment.status.toLowerCase())) continue;
      if (!enrollment.parentEmail) continue;
      if (inSessionSet(enrollment, previousIds)) previousEmails.push(enrollment.parentEmail);
      if (inSessionSet(enrollment, currentIds)) currentEmails.push(enrollment.parentEmail);
    }
  }

  return {
    totalStudents: termChildren.size,
    activeStudents: activeChildren.size,
    newEnrollments: newStudents,
    enrollmentGrowth:
      previousWindow > 0
        ? round1(((newStudents - previousWindow) / previousWindow) * 100)
        : null,
    retentionRate: computeRetentionRate(previousEmails, currentEmails),
  };
}

export function isDashboardActiveClass(
  cls: DashboardClass,
  currentSessionIds: Set<number>,
  today: string,
): boolean {
  const status = cls.status.toLowerCase();
  if (status !== 'active' && status !== 'upcoming') return false;
  if (cls.endDate != null && cls.endDate < today) return false;
  if (currentSessionIds.size === 0) return true;
  if (cls.sessionId == null) return true;
  return currentSessionIds.has(cls.sessionId);
}

export function buildAcademicClassMetrics(input: {
  today: string;
  sessions: SessionWindow[];
  classes: DashboardClass[];
  seatsByClassId: Map<number, number>;
}): AcademicClassMetrics {
  const currentIds = new Set(
    selectCurrentSessions(input.sessions, input.today).map((s) => s.id),
  );
  const active = input.classes.filter((cls) =>
    isDashboardActiveClass(cls, currentIds, input.today),
  );
  const counts = active.map((cls) => input.seatsByClassId.get(cls.id) ?? 0);
  const avg =
    counts.length > 0 ? counts.reduce((sum, n) => sum + n, 0) / counts.length : 0;
  const totalClasses = input.classes.filter(
    (cls) => cls.status.toLowerCase() !== 'cancelled',
  ).length;

  return {
    activeClasses: active.length,
    totalClasses,
    avgClassSize: round1(avg),
  };
}

export function buildStaffMetrics(input: {
  roles: Array<{ userId: number; role: string }>;
  pendingInviteEmails: string[];
  assignedUserIds: number[];
}): StaffDashboardMetrics {
  const staffIds = new Set<number>();
  const instructorIds = new Set<number>();
  for (const row of input.roles) {
    const role = row.role.trim().toLowerCase();
    if (!role || FAMILY_ROLES.has(role)) continue;
    staffIds.add(row.userId);
    if (INSTRUCTOR_ROLES.has(role)) instructorIds.add(row.userId);
  }

  const pending = new Set(
    input.pendingInviteEmails.map((e) => normalizeEmailForLookup(e)).filter(Boolean),
  );

  const assigned = new Set(input.assignedUserIds);
  let assignedInstructors = 0;
  for (const id of instructorIds) {
    if (assigned.has(id)) assignedInstructors += 1;
  }

  return {
    totalStaff: staffIds.size,
    activeInstructors: instructorIds.size,
    pendingInvites: pending.size,
    staffUtilization:
      instructorIds.size > 0
        ? round1((assignedInstructors / instructorIds.size) * 100)
        : null,
  };
}

export function enrollmentOutstandingCents(enrollment: {
  totalCost?: number | null;
  totalPaid?: number | null;
  compAmountCents?: number | null;
}): number {
  return computeEffectiveBalance(
    enrollment.totalCost ?? 0,
    enrollment.totalPaid ?? 0,
    enrollment.compAmountCents ?? 0,
  );
}

export function countsTowardOutstanding(status: string): boolean {
  return !BALANCE_EXCLUDED.has(status.toLowerCase());
}

export function paymentInLocationScope(
  enrollmentIds: number[] | null | undefined,
  scopedEnrollmentIds: Set<number> | null,
): boolean {
  if (scopedEnrollmentIds == null) return true;
  const ids = Array.isArray(enrollmentIds) ? enrollmentIds : [];
  if (ids.length === 0) return true;
  return ids.some((id) => scopedEnrollmentIds.has(id));
}

export function enrollmentInLocationScope(
  enrollment: { locationId: number | null; classLocationId: number | null },
  locationIds: number[] | null,
): boolean {
  if (locationIds == null) return true;
  const loc = enrollment.locationId ?? enrollment.classLocationId;
  if (loc == null) return true;
  return locationIds.includes(loc);
}

export function buildFinancialMetrics(input: {
  collectedCents: number;
  monthlyCollectedCents: number;
  outstandingCents: number;
  unpaidFamilies: number;
  tuitionPaidCents: number;
  billableEnrollments: number;
}): FinancialDashboardMetrics {
  const collected = Math.max(0, input.collectedCents);
  const outstanding = Math.max(0, input.outstandingCents);
  const base = collected + outstanding;
  return {
    totalRevenue: collected / 100,
    outstandingBalance: outstanding / 100,
    collectionRate: base > 0 ? round1((collected / base) * 100) : null,
    avgTuitionPaid:
      input.billableEnrollments > 0
        ? Math.round(input.tuitionPaidCents / input.billableEnrollments) / 100
        : 0,
    monthlyRevenue: Math.max(0, input.monthlyCollectedCents) / 100,
    unpaidAccounts: input.unpaidFamilies,
  };
}
