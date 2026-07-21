import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { resolveSchoolIdForUser } from '../lib/resolve-school-id';
import { resolveTrustedActiveRole } from '../lib/resolve-trusted-active-role';
import {
  aggregateEffectivePermissions,
  filterNavRegistry,
} from '@shared/permissions';

const router = Router();

/**
 * GET /api/me/effective-permissions
 * Server-authoritative effective permissions for the active role + location/school grants.
 * Fail closed when unauthenticated.
 */
router.get('/effective-permissions', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const dbUser = await storage.getUser(userId);

    let allRoles: string[] = (req.user?.allRoles ?? []).filter(Boolean);
    if (allRoles.length === 0) {
      try {
        const roleRows = await storage.getUserRolesByUserId(userId);
        const roleSet = new Set<string>();
        for (const row of roleRows) {
          if (row.role?.trim()) roleSet.add(row.role.trim());
        }
        if (dbUser?.role?.trim()) roleSet.add(dbUser.role.trim());
        if (dbUser?.activeRole?.trim()) roleSet.add(dbUser.activeRole.trim());
        allRoles = Array.from(roleSet);
      } catch {
        allRoles = dbUser?.role ? [dbUser.role] : [];
      }
    }

    const headerRole = req.headers['x-active-role'];
    const activeRole = resolveTrustedActiveRole(
      typeof headerRole === 'string' ? headerRole : undefined,
      allRoles,
      req.user?.role || dbUser?.activeRole || dbUser?.role || '',
    );

    let schoolId: number | null = null;
    if (dbUser) {
      schoolId = await resolveSchoolIdForUser(dbUser);
    }

    const locationRows = await storage.getUserLocationsByUserId(userId);
    const locationGrants = locationRows.map((ul) => ({
      locationId: ul.locationId,
      isActive: ul.isActive,
      accessLevel: ul.accessLevel,
      canViewReports: ul.canViewReports,
      canManageStaff: ul.canManageStaff,
      canManageClasses: ul.canManageClasses,
      canManageStudents: ul.canManageStudents,
      canSendNotifications: ul.canSendNotifications,
      canViewParentContacts: ul.canViewParentContacts,
    }));

    let schoolWideGrant = null;
    if (schoolId != null) {
      const schoolPerm = await storage.getUserSchoolPermissionByUserAndSchool(
        userId,
        schoolId,
      );
      if (schoolPerm) {
        schoolWideGrant = {
          isActive: schoolPerm.isActive,
          accessLevel: schoolPerm.accessLevel,
          canViewReports: schoolPerm.canViewReports,
          canManageStaff: schoolPerm.canManageStaff,
          canManageClasses: schoolPerm.canManageClasses,
          canManageStudents: schoolPerm.canManageStudents,
          canSendNotifications: schoolPerm.canSendNotifications,
          canViewParentContacts: schoolPerm.canViewParentContacts,
        };
      }
    }

    const effective = aggregateEffectivePermissions({
      activeRole,
      allRoles,
      locationGrants,
      schoolWideGrant,
    });

    const nav = filterNavRegistry(effective).map((item) => ({
      href: item.href,
      title: item.title,
      group: item.group,
    }));

    res.json({
      activeRole,
      schoolId,
      flags: effective.flags,
      accessibleLocationIds: effective.accessibleLocationIds,
      canAccessEntireSchool: effective.canAccessEntireSchool,
      isSchoolAdminBypass: effective.isSchoolAdminBypass,
      showAdminNavGroups: effective.showAdminNavGroups,
      nav,
    });
  } catch (error) {
    console.error('GET /api/me/effective-permissions failed:', error);
    res.status(500).json({ message: 'Failed to resolve permissions' });
  }
});

export default router;
