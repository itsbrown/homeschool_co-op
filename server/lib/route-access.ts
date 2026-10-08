import type { Request, Response } from "express";
import { storage } from "../storage";
import { childMatchesParent } from "@shared/parent-identity";
import {
  getAllSchoolsCore,
  getSchoolsCoreByAdminId,
} from "./school-db";
import type { User } from "@shared/schema";

const PLATFORM_ROLES = new Set(["superAdmin", "admin"]);
const SCHOOL_STAFF_ROLES = new Set([
  "schoolAdmin",
  "director",
  "educator",
  "mentor",
  "teacher",
  "instructor",
]);

type AccessRequest = Request & {
  user?: {
    id?: number;
    email?: string;
    role?: string;
    allRoles?: string[];
    schoolId?: number | null;
  };
};

export function requestRoleNames(req: AccessRequest): string[] {
  const fromAll = req.user?.allRoles;
  if (Array.isArray(fromAll) && fromAll.length > 0) {
    return fromAll.map((role) => String(role));
  }
  if (req.user?.role) {
    return [String(req.user.role)];
  }
  return [];
}

export function isPlatformAdmin(req: AccessRequest): boolean {
  return requestRoleNames(req).some((role) => PLATFORM_ROLES.has(role));
}

export function isSuperAdmin(req: AccessRequest): boolean {
  return requestRoleNames(req).some((role) => role === "superAdmin");
}

export function isSchoolStaff(req: AccessRequest): boolean {
  return requestRoleNames(req).some(
    (role) => SCHOOL_STAFF_ROLES.has(role) || PLATFORM_ROLES.has(role),
  );
}

/**
 * Schools this user may read as staff.
 * School admins resolve through schools.admin_id (and schoolAdmin user_roles),
 * not a stale users.school_id that points at a different school.
 */
export async function schoolsVisibleToStaff(
  user: User,
  roleNames: string[],
): Promise<number[]> {
  if (roleNames.some((role) => PLATFORM_ROLES.has(role))) {
    const schools = await getAllSchoolsCore();
    return schools.map((school) => school.id);
  }

  const ids = new Set<number>();
  if (roleNames.some((role) => role === "schoolAdmin" || role === "director")) {
    const administered = await getSchoolsCoreByAdminId(user.id);
    for (const school of administered) {
      ids.add(school.id);
    }
  }

  try {
    const rows = await storage.getUserRolesByUserId(user.id);
    for (const row of rows) {
      if (row.schoolId != null && SCHOOL_STAFF_ROLES.has(row.role)) {
        ids.add(row.schoolId);
      }
    }
  } catch (error) {
    console.error("schoolsVisibleToStaff role lookup failed:", error);
  }

  if (ids.size === 0 && user.schoolId != null && user.schoolId > 0) {
    ids.add(user.schoolId);
  }

  return Array.from(ids);
}

export async function staffCanAccessSchool(
  req: AccessRequest,
  schoolId: number | null | undefined,
): Promise<boolean> {
  if (schoolId == null || !Number.isFinite(schoolId)) {
    return false;
  }
  if (!isSchoolStaff(req)) {
    return false;
  }
  if (isPlatformAdmin(req)) {
    return true;
  }
  const userId = req.user?.id;
  if (typeof userId !== "number") {
    return false;
  }
  const dbUser = await storage.getUser(userId);
  if (!dbUser) {
    return false;
  }
  const visible = await schoolsVisibleToStaff(dbUser, requestRoleNames(req));
  return visible.includes(schoolId);
}

export async function canReadChild(
  req: AccessRequest,
  child: { parentId?: number | null; parentEmail?: string | null; schoolId?: number | null },
): Promise<boolean> {
  if (isPlatformAdmin(req)) {
    return true;
  }
  const userId = typeof req.user?.id === "number" ? req.user.id : null;
  if (childMatchesParent(child, userId, req.user?.email)) {
    return true;
  }
  if (child.schoolId != null && (await staffCanAccessSchool(req, child.schoolId))) {
    return true;
  }
  return false;
}

export function deny(res: Response, status: number, message: string) {
  return res.status(status).json({ message });
}
