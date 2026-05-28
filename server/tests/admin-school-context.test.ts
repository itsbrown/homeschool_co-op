import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  canAdminManageEnrollmentSchool,
  resolveEnrollmentTenantSchoolId,
} from '../lib/admin-school-context';
import { storage } from '../storage';
import * as resolveSchoolId from '../lib/resolve-school-id';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';
import * as schoolDb from '../lib/school-db';

describe('resolveSchoolIdForUser (GET /api/school-admin/my-school)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers schools.admin_id school over stale users.school_id and activeRoleId', async () => {
    jest.spyOn(schoolDb, 'getSchoolCoreByAdminId').mockResolvedValue({
      id: 3,
      name: 'ASA',
      registrationCode: 'X8BMC1JE',
    } as schoolDb.SchoolCoreRow);

    const schoolId = await resolveSchoolIdForUser({
      id: 104,
      email: 'contact.americanseekersacademy@gmail.com',
      role: 'schoolAdmin',
      schoolId: 1,
      activeRoleId: 501,
    } as any);

    expect(schoolId).toBe(3);
  });
});

describe('admin-school-context enrollment scope', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('resolveEnrollmentTenantSchoolId prefers class school over enrollment.school_id', async () => {
    jest.spyOn(storage, 'getClassById').mockResolvedValue({
      id: 10,
      schoolId: 2,
      title: 'Tycoons',
    } as any);

    const schoolId = await resolveEnrollmentTenantSchoolId({
      schoolId: 3,
      classId: 10,
      marketplaceClassId: null,
    });

    expect(schoolId).toBe(2);
  });

  it('canAdminManageEnrollmentSchool allows enrollments at schools.admin_id school when user_roles points elsewhere', async () => {
    jest.spyOn(storage, 'getClassById').mockResolvedValue({
      id: 10,
      schoolId: 2,
      title: 'Class',
    } as any);
    jest.spyOn(resolveSchoolId, 'getAdminPermittedSchoolAccess').mockResolvedValue({
      schoolIds: [2, 3],
      isUnrestricted: false,
      effectiveRole: 'schoolAdmin',
    });

    const allowed = await canAdminManageEnrollmentSchool(
      { id: 1, role: 'schoolAdmin', schoolId: 3 } as any,
      { schoolId: 3, classId: 10, marketplaceClassId: null },
    );

    expect(allowed).toBe(true);
  });

  it('canAdminManageEnrollmentSchool denies when enrollment school is not in permitted list', async () => {
    jest.spyOn(resolveSchoolId, 'getAdminPermittedSchoolAccess').mockResolvedValue({
      schoolIds: [3],
      isUnrestricted: false,
      effectiveRole: 'schoolAdmin',
    });

    const allowed = await canAdminManageEnrollmentSchool(
      { id: 1, role: 'schoolAdmin', schoolId: 3 } as any,
      { schoolId: 2, classId: null, marketplaceClassId: null },
    );

    expect(allowed).toBe(false);
  });
});
