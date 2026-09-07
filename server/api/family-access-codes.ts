import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import {
  parentAuthCriteriaFromRequest,
  resolveParentDbUser,
} from "../lib/parent-auth-scope";
import { ensureFamilyAccessCodesSchema } from "../lib/ensure-family-access-codes-schema";
import {
  FamilyAccessCodeError,
  getParentAccessCodeView,
  importFamilyAccessCodes,
  listActiveCodesForLocation,
  revokeActiveForParent,
  upsertParentAccessCode,
} from "../lib/family-access-codes";

const adminRouter = Router();
export const parentAccessCodeRouter = Router();

async function ensureReady() {
  if (process.env.NODE_ENV === "production") return;
  try {
    await ensureFamilyAccessCodesSchema();
  } catch (e) {
    console.warn("[family-access-codes] ensure schema:", e);
  }
}

function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof FamilyAccessCodeError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  const code = (err as { code?: string })?.code;
  if (code === "42P01" || code === "42703") {
    return res.status(503).json({
      message:
        "Door code schema is missing. Apply server/migrations/263-family-access-codes.sql.",
      code: "ACCESS_CODE_SCHEMA_MISSING",
    });
  }
  console.error(fallback, err);
  return res.status(500).json({ message: fallback });
}

async function assertCanManageDoorCodes(req: any, res: Response): Promise<boolean> {
  const adminId = req.user?.id;
  if (!adminId) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }
  const userLocations = await storage.getUserLocationsByUserId(adminId);
  const hasManageStudents = userLocations.some((ul: { canManageStudents?: boolean }) => ul.canManageStudents === true);
  const role = req.user?.role;
  const allRoles: string[] = req.user?.allRoles || [];
  const isSchoolAdmin =
    role === "schoolAdmin" ||
    role === "admin" ||
    role === "superAdmin" ||
    allRoles.includes("schoolAdmin") ||
    allRoles.includes("director");
  if (!hasManageStudents && !isSchoolAdmin) {
    res.status(403).json({ message: "Permission denied - canManageStudents permission required" });
    return false;
  }
  return true;
}

adminRouter.use(async (_req, _res, next) => {
  await ensureReady();
  next();
});

adminRouter.get(
  "/access-codes",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res: Response) => {
    try {
      if (!(await assertCanManageDoorCodes(req, res))) return;
      const schoolId = Number(req.schoolId);
      const locationId = parseInt(String(req.query.locationId ?? ""), 10);
      if (!Number.isFinite(locationId)) {
        return res.status(400).json({ message: "locationId is required" });
      }
      const codes = await listActiveCodesForLocation(schoolId, locationId);
      res.json({ codes });
    } catch (err) {
      handleError(res, err, "Failed to list door codes");
    }
  },
);

const upsertSchema = z.object({
  code: z.string().min(1).max(12),
});

adminRouter.put(
  "/parents/:parentId/access-code",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res: Response) => {
    try {
      if (!(await assertCanManageDoorCodes(req, res))) return;
      const schoolId = Number(req.schoolId);
      const parentId = parseInt(req.params.parentId, 10);
      if (!Number.isFinite(parentId)) {
        return res.status(400).json({ message: "Invalid parent ID" });
      }
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid door code" });
      }
      const row = await upsertParentAccessCode({
        schoolId,
        parentId,
        code: parsed.data.code,
        assignedBy: req.user.id,
        actorEmail: req.user.email ?? null,
        actorRole: req.user.role ?? "schoolAdmin",
      });
      res.json({
        parentId: row.parentId,
        locationId: row.locationId,
        code: row.code,
        status: row.status,
      });
    } catch (err) {
      handleError(res, err, "Failed to save door code");
    }
  },
);

adminRouter.delete(
  "/parents/:parentId/access-code",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res: Response) => {
    try {
      if (!(await assertCanManageDoorCodes(req, res))) return;
      const schoolId = Number(req.schoolId);
      const parentId = parseInt(req.params.parentId, 10);
      if (!Number.isFinite(parentId)) {
        return res.status(400).json({ message: "Invalid parent ID" });
      }
      const parent = await storage.getUser(parentId);
      if (!parent || parent.schoolId !== schoolId) {
        return res.status(404).json({ message: "Parent not found" });
      }
      const result = await revokeActiveForParent({
        parentId,
        schoolId,
        locationId: parent.locationId,
        actorId: req.user.id,
        actorEmail: req.user.email ?? null,
        actorRole: req.user.role ?? "schoolAdmin",
      });
      res.json({ revoked: result.revoked });
    } catch (err) {
      handleError(res, err, "Failed to clear door code");
    }
  },
);

const importSchema = z.object({
  csv: z.string().min(1),
  locationId: z.number().int().positive().optional().nullable(),
  dryRun: z.boolean().optional(),
  mapping: z
    .object({
      email: z.string().optional(),
      code: z.string().optional(),
      location: z.string().optional(),
    })
    .optional()
    .nullable(),
});

adminRouter.post(
  "/access-codes/import",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res: Response) => {
    try {
      if (!(await assertCanManageDoorCodes(req, res))) return;
      const schoolId = Number(req.schoolId);
      const parsed = importSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid import payload" });
      }
      const result = await importFamilyAccessCodes({
        schoolId,
        csv: parsed.data.csv,
        locationId: parsed.data.locationId ?? null,
        dryRun: parsed.data.dryRun !== false,
        assignedBy: req.user.id,
        actorEmail: req.user.email ?? null,
        actorRole: req.user.role ?? "schoolAdmin",
        mapping: parsed.data.mapping,
      });
      res.json(result);
    } catch (err) {
      handleError(res, err, "Failed to import door codes");
    }
  },
);

parentAccessCodeRouter.use(async (_req, _res, next) => {
  await ensureReady();
  next();
});

parentAccessCodeRouter.get("/access-code", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const criteria = parentAuthCriteriaFromRequest(req);
    if (!criteria.email && !criteria.supabaseId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const parent = await resolveParentDbUser(storage, criteria);
    if (!parent) {
      return res.status(401).json({ message: "Parent account not found" });
    }
    const view = await getParentAccessCodeView(parent.id);
    res.json(view);
  } catch (err) {
    handleError(res, err, "Failed to load door code");
  }
});

export default adminRouter;
