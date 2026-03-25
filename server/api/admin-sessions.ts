import { Router } from "express";
import { sessions, insertSessionSchema } from "@shared/schema";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import { getDb } from "../db";
import { eq, and, desc, inArray } from "drizzle-orm";

const router = Router();

// Director has full access to admin-sessions routes.
// Note: requireAdmin is intentionally NOT used here because it uses 'school-admin' (hyphen)
// which does NOT match the DB value 'schoolAdmin' (camelCase), causing 403s for school admins.
const requireAdminOrDirector = requireRole(['admin', 'superAdmin', 'schoolAdmin', 'director']);

router.get("/", supabaseAuth, requireAdminOrDirector, requireSchoolContext, async (req: any, res) => {
  try {
    const db = getDb();
    const schoolId = parseInt(req.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.schoolId, schoolId))
      .orderBy(desc(sessions.sortOrder));

    res.json(result);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
});

router.get("/open", supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.userId;
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

    const db = getDb();
    const result = await db
      .select()
      .from(sessions)
      .where(and(inArray(sessions.schoolId, schoolIds), eq(sessions.enrollmentOpen, true)))
      .orderBy(desc(sessions.sortOrder));

    res.json(result);
  } catch (error) {
    console.error("Error fetching open sessions:", error);
    res.status(500).json({ message: "Failed to fetch open sessions" });
  }
});

router.get("/:id", supabaseAuth, requireAdminOrDirector, requireSchoolContext, async (req: any, res) => {
  try {
    const db = getDb();
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const result = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.schoolId, schoolId)));

    if (result.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

router.post("/", supabaseAuth, requireAdminOrDirector, requireSchoolContext, async (req: any, res) => {
  try {
    const db = getDb();
    const schoolId = parseInt(req.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const body = { ...req.body, schoolId };
    const parsed = insertSessionSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid session data", errors: parsed.error.flatten() });
    }

    const [created] = await db.insert(sessions).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ message: "Failed to create session" });
  }
});

router.patch("/:id", supabaseAuth, requireAdminOrDirector, requireSchoolContext, async (req: any, res) => {
  try {
    const db = getDb();
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const existing = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.schoolId, schoolId)));

    if (existing.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    const updateData: Record<string, any> = { ...req.body, updatedAt: new Date() };
    delete updateData.id;
    delete updateData.schoolId;
    delete updateData.createdAt;

    const [updated] = await db
      .update(sessions)
      .set(updateData)
      .where(and(eq(sessions.id, id), eq(sessions.schoolId, schoolId)))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({ message: "Failed to update session" });
  }
});

router.delete("/:id", supabaseAuth, requireAdminOrDirector, requireSchoolContext, async (req: any, res) => {
  try {
    const db = getDb();
    const schoolId = parseInt(req.schoolId);
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const existing = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.schoolId, schoolId)));

    if (existing.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.schoolId, schoolId)));
    res.json({ message: "Session deleted" });
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ message: "Failed to delete session" });
  }
});

export default router;
