import { Router, type Response } from "express";
import { supabaseAuth } from "../middleware/supabase-auth";
import {
  attachAccessScope,
  locationFilterIds,
  requirePermission,
} from "../middleware/access-scope";
import { storage } from "../storage";
import { resolveSchoolIdForUser } from "../lib/resolve-school-id";
import { loadSchoolEmergencyContactLists } from "../lib/emergency-contact-lists";

const router = Router();

async function getSchoolIdFromRequest(req: any, res: Response): Promise<number | null> {
  if (req.schoolId) return Number(req.schoolId);
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(400).json({ message: "User email not found in request" });
    return null;
  }
  try {
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      res.status(400).json({ message: "User not found in database" });
      return null;
    }
    const schoolId = await resolveSchoolIdForUser(user);
    if (schoolId != null) return schoolId;
    res.status(400).json({ message: "School ID not found in database" });
    return null;
  } catch (error) {
    console.error("[emergency-contacts] school context:", error);
    res.status(500).json({ message: "Error determining school context" });
    return null;
  }
}

router.get(
  "/emergency-contacts",
  supabaseAuth,
  attachAccessScope,
  requirePermission("canManageStudents"),
  async (req: any, res: Response) => {
    try {
      const schoolId = await getSchoolIdFromRequest(req, res);
      if (schoolId === null) return;

      const classIdRaw = req.query?.classId;
      const classId =
        classIdRaw != null && classIdRaw !== "" && classIdRaw !== "all"
          ? Number(classIdRaw)
          : null;
      if (classId != null && !Number.isFinite(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
      }

      const payload = await loadSchoolEmergencyContactLists({
        schoolId,
        classId,
        locationIds: locationFilterIds(req.accessScope),
      });
      res.json(payload);
    } catch (error) {
      console.error("[emergency-contacts] school list:", error);
      res.status(500).json({ message: "Failed to load emergency contacts" });
    }
  },
);

router.get(
  "/classes/:id/emergency-contacts",
  supabaseAuth,
  attachAccessScope,
  requirePermission("canManageStudents"),
  async (req: any, res: Response) => {
    try {
      const schoolId = await getSchoolIdFromRequest(req, res);
      if (schoolId === null) return;

      const classId = Number(req.params.id);
      if (!Number.isFinite(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
      }

      const classData = await storage.getClassById(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }
      if (classData.schoolId !== schoolId) {
        return res.status(403).json({ message: "Access denied to this class" });
      }

      const allowed = locationFilterIds(req.accessScope);
      if (
        allowed &&
        classData.locationId != null &&
        !allowed.includes(classData.locationId)
      ) {
        return res.status(403).json({ message: "Class is outside your location scope" });
      }

      const payload = await loadSchoolEmergencyContactLists({
        schoolId,
        classId,
        locationIds: allowed,
      });
      const classList = payload.classes[0] ?? null;
      res.json({
        ...payload,
        classList,
      });
    } catch (error) {
      console.error("[emergency-contacts] class list:", error);
      res.status(500).json({ message: "Failed to load class emergency contacts" });
    }
  },
);

export default router;
