import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import {
  buildSchoolLiteracyAnalytics,
  buildChildProgressAnalytics,
  verifyParentOwnsChild,
} from "../lib/progress-analytics";

const router = Router();

const schoolQuerySchema = z.object({
  schoolYear: z.string().optional(),
  sessionId: z.coerce.number().optional(),
  locationId: z.coerce.number().optional(),
  jurisdictionCode: z.string().optional(),
});

router.get("/school", supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = Number((req as any).schoolId);
    const parsed = schoolQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", errors: parsed.error.errors });
    }
    const data = await buildSchoolLiteracyAnalytics(schoolId, parsed.data);
    res.json(data);
  } catch (e) {
    console.error("progress analytics school:", e);
    res.status(500).json({ message: "Failed to load school progress analytics" });
  }
});

const childrenQuerySchema = z.object({
  ids: z.string().min(1),
  schoolYear: z.string().optional(),
});

/** Batch child progress analytics for multi-select compare (max 8). */
router.get("/children", supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = Number((req as any).schoolId);
    const parsed = childrenQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", errors: parsed.error.errors });
    }
    const ids = parsed.data.ids
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (!ids.length || ids.length > 8) {
      return res.status(400).json({ message: "Provide 1–8 child ids" });
    }
    const childrenData = [];
    for (const childId of ids) {
      const data = await buildChildProgressAnalytics(schoolId, childId, {
        schoolYear: parsed.data.schoolYear,
      });
      if (data) childrenData.push(data);
    }
    res.json({ children: childrenData });
  } catch (e) {
    console.error("progress analytics children:", e);
    res.status(500).json({ message: "Failed to load children progress analytics" });
  }
});

router.get("/child/:childId", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    if (Number.isNaN(childId)) {
      return res.status(400).json({ message: "Invalid child id" });
    }
    const user = (req as any).user;
    const role = user?.role || user?.activeRole;
    const schoolId = Number(user?.schoolId || (req as any).schoolId);

    if (role === "parent") {
      const owns = await verifyParentOwnsChild(user.id, childId);
      if (!owns) return res.status(403).json({ message: "Forbidden" });
      const { getDb } = await import("../db");
      const { children } = await import("../../shared/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const [childRow] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
      if (!childRow) return res.status(404).json({ message: "Child not found" });
      const data = await buildChildProgressAnalytics(childRow.schoolId, childId, {
        schoolYear: typeof req.query.schoolYear === "string" ? req.query.schoolYear : undefined,
      });
      if (!data) return res.status(404).json({ message: "Child not found" });
      return res.json(data);
    }

    if (!["schoolAdmin", "admin", "director", "educator", "teacher", "superAdmin"].includes(role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    if (!schoolId) {
      return res.status(400).json({ message: "School context required" });
    }

    const data = await buildChildProgressAnalytics(schoolId, childId, {
      schoolYear: typeof req.query.schoolYear === "string" ? req.query.schoolYear : undefined,
    });
    if (!data) return res.status(404).json({ message: "Child not found" });
    res.json(data);
  } catch (e) {
    console.error("progress analytics child:", e);
    res.status(500).json({ message: "Failed to load child progress analytics" });
  }
});

export default router;
