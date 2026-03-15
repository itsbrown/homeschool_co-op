import { Router } from "express";
import { insertSessionSchema } from "@shared/schema";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";

const router = Router();

const requireSchoolAdmin = requireRole(['schoolAdmin', 'admin', 'superAdmin']);

router.get("/", supabaseAuth, requireSchoolAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const result = await storage.getEnrollmentSessionsBySchoolId(schoolId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
});

router.get("/open", supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const children = await storage.getChildrenByParentId(userId);
    if (children.length === 0) {
      return res.json([]);
    }

    const schoolIds = [...new Set(children.map((c: any) => c.schoolId).filter(Boolean))];
    if (schoolIds.length === 0) {
      return res.json([]);
    }

    const result = await storage.getOpenEnrollmentSessionsBySchoolIds(schoolIds);
    res.json(result);
  } catch (error) {
    console.error("Error fetching open sessions:", error);
    res.status(500).json({ message: "Failed to fetch open sessions" });
  }
});

router.get("/:id", supabaseAuth, requireSchoolAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await storage.getEnrollmentSessionById(id);
    if (!session || session.schoolId !== schoolId) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json(session);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

router.post("/", supabaseAuth, requireSchoolAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const body = { ...req.body, schoolId };
    const parsed = insertSessionSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid session data", errors: parsed.error.flatten() });
    }

    const created = await storage.createEnrollmentSession(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ message: "Failed to create session" });
  }
});

router.patch("/:id", supabaseAuth, requireSchoolAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const existing = await storage.getEnrollmentSessionById(id);
    if (!existing || existing.schoolId !== schoolId) {
      return res.status(404).json({ message: "Session not found" });
    }

    const updateData: Record<string, any> = { ...req.body };
    delete updateData.id;
    delete updateData.schoolId;
    delete updateData.createdAt;

    const updated = await storage.updateEnrollmentSession(id, updateData);
    res.json(updated);
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({ message: "Failed to update session" });
  }
});

router.delete("/:id", supabaseAuth, requireSchoolAdmin, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const existing = await storage.getEnrollmentSessionById(id);
    if (!existing || existing.schoolId !== schoolId) {
      return res.status(404).json({ message: "Session not found" });
    }

    await storage.deleteEnrollmentSession(id);
    res.json({ message: "Session deleted" });
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ message: "Failed to delete session" });
  }
});

export default router;
