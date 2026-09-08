import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { supabaseAuth, requireSchoolContext } from "../middleware/supabase-auth";
import { ensureMathLevelSchema } from "../lib/ensure-math-level-schema";

const router = Router();

const ALLOWED_ROLES = ["schoolAdmin", "admin", "educator", "teacher"];

function requireMathLevelRole(req: Request, res: Response, next: Function) {
  const role = (req.user as any)?.role || (req.user as any)?.activeRole;
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({
      message: "Only educators and administrators can access math level data",
    });
  }
  next();
}

const mathLevelEntrySchema = z.object({
  childId: z.number().int().positive(),
  mathLevel: z.string().trim().min(1).max(80),
  notes: z.string().max(2000).optional(),
});

async function ensureReady() {
  try {
    await ensureMathLevelSchema();
  } catch (e) {
    console.warn("[math-level] ensure schema:", e);
  }
}

// GET /api/math-level/history/:childId
router.get(
  "/history/:childId",
  supabaseAuth,
  requireSchoolContext,
  requireMathLevelRole,
  async (req: Request, res: Response) => {
    try {
      await ensureReady();
      const schoolId = (req.user as any).schoolId;
      const childId = parseInt(req.params.childId, 10);
      if (Number.isNaN(childId)) {
        return res.status(400).json({ message: "Invalid student ID" });
      }
      const child = await storage.getChildByIdForSchool(childId, schoolId);
      if (!child) {
        return res.status(404).json({ message: "Student not found in your school" });
      }
      const history = await storage.getMathLevelHistoryForChildBySchool(childId, schoolId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching math level history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  },
);

// GET /api/math-level/students
router.get(
  "/students",
  supabaseAuth,
  requireSchoolContext,
  requireMathLevelRole,
  async (req: Request, res: Response) => {
    try {
      await ensureReady();
      const schoolId = (req.user as any).schoolId;
      const students = await storage.getChildrenForSchool(schoolId);
      res.json(students);
    } catch (error) {
      console.error("Error fetching math level students:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  },
);

// POST /api/math-level/entry
router.post(
  "/entry",
  supabaseAuth,
  requireSchoolContext,
  requireMathLevelRole,
  async (req: Request, res: Response) => {
    try {
      await ensureReady();
      const schoolId = (req.user as any).schoolId;
      const userId = (req.user as any).id;

      const parsed = mathLevelEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { childId, mathLevel, notes } = parsed.data;

      const child = await storage.getChildByIdForSchool(childId, schoolId);
      if (!child) {
        return res.status(404).json({ message: "Student not found in your school" });
      }

      const assessment = await storage.recordMathLevelAssessment(childId, schoolId, userId, {
        mathLevel,
        notes,
      });

      res.json({ success: true, assessment });
    } catch (error) {
      console.error("Error saving math level entry:", error);
      res.status(500).json({ message: "Failed to save math level entry" });
    }
  },
);

export default router;
