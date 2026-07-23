/**
 * Permission fixtures for integration tests.
 */
import { testDb } from './testDatabase';
import { storage } from '../../storage';

export type PermissionScenarioName =
  | 'full_school_admin'
  | 'finance_only_staff'
  | 'academics_only_staff'
  | 'multi_loc_split'
  | 'regional_manager'
  | 'educator_no_flags'
  | 'inactive_assignment';

export async function seedPermissionScenario(name: PermissionScenarioName) {
  const env = await testDb.setupTestEnvironment();
  const school = env.school;
  const admin = env.admin;
  const loc1 = env.locations[0];
  const loc2 = env.locations[1];

  if (name === 'full_school_admin') {
    return { school, admin, loc1, loc2, actor: admin };
  }

  const staff = await testDb.createTestUser({
    role: 'teacher',
    schoolId: school.id,
    locationId: loc1.id,
    name: `Staff ${name}`,
  });

  if (name === 'educator_no_flags') {
    return { school, admin, loc1, loc2, actor: staff };
  }

  if (name === 'finance_only_staff') {
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc1.id,
      accessLevel: 'view',
      canViewReports: true,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    return { school, admin, loc1, loc2, actor: staff };
  }

  if (name === 'academics_only_staff') {
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc1.id,
      accessLevel: 'manage',
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: true,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    return { school, admin, loc1, loc2, actor: staff };
  }

  if (name === 'multi_loc_split') {
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc1.id,
      accessLevel: 'view',
      canViewReports: true,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc2.id,
      accessLevel: 'view',
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: true,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    return { school, admin, loc1, loc2, actor: staff };
  }

  if (name === 'regional_manager') {
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc1.id,
      accessLevel: 'view',
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc2.id,
      accessLevel: 'view',
      canViewReports: false,
      canManageStaff: false,
      canManageClasses: false,
      canManageStudents: false,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    await storage.createUserSchoolPermission({
      userId: staff.id,
      schoolId: school.id,
      accessLevel: 'manage',
      canViewReports: true,
      canManageStaff: false,
      canManageClasses: true,
      canManageStudents: true,
      canSendNotifications: false,
      canViewParentContacts: false,
      isActive: true,
    } as any);
    return { school, admin, loc1, loc2, actor: staff };
  }

  if (name === 'inactive_assignment') {
    await storage.createUserLocation({
      userId: staff.id,
      locationId: loc1.id,
      accessLevel: 'admin',
      canViewReports: true,
      canManageStaff: true,
      canManageClasses: true,
      canManageStudents: true,
      canSendNotifications: true,
      canViewParentContacts: true,
      isActive: false,
    } as any);
    return { school, admin, loc1, loc2, actor: staff };
  }

  throw new Error(`Unknown scenario: ${name}`);
}
