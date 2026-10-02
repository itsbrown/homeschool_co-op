import { describe, expect, it } from '@jest/globals';
import {
  buildAcademicClassMetrics,
  buildEnrollmentMetrics,
  buildFinancialMetrics,
  buildStaffMetrics,
  enrollmentInLocationScope,
  enrollmentOutstandingCents,
  paymentInLocationScope,
  selectCurrentSessions,
  selectPreviousSessions,
  type DashboardEnrollment,
  type SessionWindow,
} from '../../lib/school-dashboard-metrics';

const today = '2026-09-22';

const sessions: SessionWindow[] = [
  { id: 1, startDate: '2026-01-06', endDate: '2026-05-22', status: 'completed' },
  { id: 2, startDate: '2026-06-01', endDate: '2026-08-14', status: 'completed' },
  { id: 3, startDate: '2026-09-08', endDate: '2026-12-18', status: 'active' },
  { id: 4, startDate: '2026-09-08', endDate: '2026-12-18', status: 'active' },
  { id: 5, startDate: '2027-01-05', endDate: '2027-03-20', status: 'upcoming' },
];

function enrollment(partial: Partial<DashboardEnrollment> & Pick<DashboardEnrollment, 'childId' | 'status'>): DashboardEnrollment {
  return {
    parentEmail: 'parent@example.com',
    sessionId: null,
    classSessionId: null,
    enrollmentDate: '2026-08-01',
    programEndDate: null,
    ...partial,
  };
}

describe('current and previous terms', () => {
  it('keeps the in-progress term and leaves later upcoming terms out', () => {
    const current = selectCurrentSessions(sessions, today);
    expect(current.map((s) => s.id).sort()).toEqual([3, 4]);
    const previous = selectPreviousSessions(sessions, current);
    expect(previous.map((s) => s.id)).toEqual([2]);
  });

  it('uses the next upcoming month when nothing is in progress', () => {
    const upcomingOnly: SessionWindow[] = [
      { id: 5, startDate: '2027-01-05', endDate: '2027-03-20', status: 'upcoming' },
      { id: 6, startDate: '2027-01-12', endDate: '2027-03-20', status: 'upcoming' },
      { id: 7, startDate: '2027-04-06', endDate: '2027-06-12', status: 'upcoming' },
    ];
    expect(selectCurrentSessions(upcomingOnly, today).map((s) => s.id)).toEqual([5, 6]);
  });
});

describe('enrollment metrics', () => {
  const rows: DashboardEnrollment[] = [
    enrollment({
      childId: 1,
      status: 'enrolled',
      sessionId: 3,
      parentEmail: 'a@school.test',
      enrollmentDate: '2026-05-01',
    }),
    enrollment({
      childId: 1,
      status: 'enrolled',
      sessionId: 2,
      parentEmail: 'a@school.test',
      enrollmentDate: '2026-05-01',
    }),
    enrollment({
      childId: 2,
      status: 'pending_payment',
      classSessionId: 3,
      parentEmail: 'b@school.test',
      enrollmentDate: '2026-09-10',
    }),
    enrollment({
      childId: 3,
      status: 'enrolled',
      sessionId: 5,
      parentEmail: 'c@school.test',
      enrollmentDate: '2026-01-15',
    }),
    enrollment({
      childId: 4,
      status: 'enrolled',
      sessionId: 2,
      parentEmail: 'd@school.test',
      enrollmentDate: '2026-06-02',
    }),
    enrollment({
      childId: 5,
      status: 'cancelled',
      sessionId: 3,
      parentEmail: 'e@school.test',
      enrollmentDate: '2026-09-01',
    }),
  ];

  it('counts distinct current-term students and ignores later terms', () => {
    const metrics = buildEnrollmentMetrics({ today, sessions, enrollments: rows });
    expect(metrics.activeStudents).toBe(1);
    expect(metrics.totalStudents).toBe(2);
    expect(metrics.newEnrollments).toBe(1);
    expect(metrics.retentionRate).toBe(50);
  });

  it('does not treat a returning student as new because of a second class row', () => {
    const metrics = buildEnrollmentMetrics({
      today,
      sessions,
      enrollments: [
        enrollment({
          childId: 9,
          status: 'enrolled',
          sessionId: 3,
          enrollmentDate: '2026-09-20',
        }),
        enrollment({
          childId: 9,
          status: 'completed',
          sessionId: 2,
          enrollmentDate: '2026-06-01',
        }),
      ],
    });
    expect(metrics.newEnrollments).toBe(0);
    expect(metrics.enrollmentGrowth).toBeNull();
  });

  it('returns null retention when there is no prior term', () => {
    const metrics = buildEnrollmentMetrics({
      today,
      sessions: [sessions[2]],
      enrollments: [
        enrollment({ childId: 1, status: 'enrolled', sessionId: 3, enrollmentDate: '2026-09-01' }),
      ],
    });
    expect(metrics.retentionRate).toBeNull();
    expect(metrics.activeStudents).toBe(1);
  });
});

describe('class size', () => {
  it('averages live seats on current-term classes and skips later terms', () => {
    const metrics = buildAcademicClassMetrics({
      today,
      sessions,
      classes: [
        { id: 10, status: 'active', endDate: '2026-12-18', sessionId: 3 },
        { id: 11, status: 'active', endDate: '2026-12-18', sessionId: 3 },
        { id: 12, status: 'upcoming', endDate: '2027-03-20', sessionId: 5 },
        { id: 13, status: 'completed', endDate: '2026-05-22', sessionId: 1 },
      ],
      seatsByClassId: new Map([
        [10, 8],
        [11, 0],
        [12, 40],
      ]),
    });
    expect(metrics.activeClasses).toBe(2);
    expect(metrics.avgClassSize).toBe(4);
    expect(metrics.totalClasses).toBe(4);
  });
});

describe('staff metrics', () => {
  it('counts mentor roles and open invites, not inactive staff rows', () => {
    const metrics = buildStaffMetrics({
      roles: [
        { userId: 1, role: 'Mentor' },
        { userId: 1, role: 'parent' },
        { userId: 2, role: 'educator' },
        { userId: 3, role: 'schoolAdmin' },
      ],
      pendingInviteEmails: ['New@School.test', 'new@school.test', 'other@school.test'],
      assignedUserIds: [1],
    });
    expect(metrics.totalStaff).toBe(3);
    expect(metrics.activeInstructors).toBe(2);
    expect(metrics.pendingInvites).toBe(2);
    expect(metrics.staffUtilization).toBe(50);
  });
});

describe('financial metrics', () => {
  it('uses dollars collected over dollars billed', () => {
    const metrics = buildFinancialMetrics({
      collectedCents: 22_232_545,
      monthlyCollectedCents: 3_699_635,
      outstandingCents: 8_594_708,
      unpaidFamilies: 40,
      tuitionPaidCents: 22_232_545,
      billableEnrollments: 100,
    });
    expect(metrics.totalRevenue).toBeCloseTo(222325.45);
    expect(metrics.monthlyRevenue).toBeCloseTo(36996.35);
    expect(metrics.outstandingBalance).toBeCloseTo(85947.08);
    expect(metrics.collectionRate).toBe(72.1);
    expect(metrics.unpaidAccounts).toBe(40);
  });

  it('returns null collection rate when nothing has been billed', () => {
    expect(
      buildFinancialMetrics({
        collectedCents: 0,
        monthlyCollectedCents: 0,
        outstandingCents: 0,
        unpaidFamilies: 0,
        tuitionPaidCents: 0,
        billableEnrollments: 0,
      }).collectionRate,
    ).toBeNull();
  });

  it('scopes a campus without dropping school-wide payments', () => {
    expect(enrollmentInLocationScope({ locationId: 3, classLocationId: null }, [3])).toBe(true);
    expect(enrollmentInLocationScope({ locationId: null, classLocationId: 9 }, [3])).toBe(false);
    expect(enrollmentInLocationScope({ locationId: null, classLocationId: null }, [3])).toBe(true);
    expect(paymentInLocationScope([], new Set([1]))).toBe(true);
    expect(paymentInLocationScope([2], new Set([1]))).toBe(false);
    expect(enrollmentOutstandingCents({ totalCost: 150000, totalPaid: 50000, compAmountCents: 25000 })).toBe(75000);
  });
});
