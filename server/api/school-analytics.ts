import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import {
  buildEngagementAnalytics,
  buildCartAbandonmentAnalytics,
  type AnalyticsFilters,
} from "../lib/school-analytics";

const router = Router();

const ADMIN_ROLES = ["schoolAdmin", "admin", "director", "superAdmin"];

function requireSchoolAdmin(req: Request, res: Response, next: Function) {
  const role = (req as any).user?.role || (req as any).user?.activeRole;
  const allRoles: string[] = (req as any).user?.allRoles || [];
  const ok =
    ADMIN_ROLES.includes(role) ||
    allRoles.some((r) => ADMIN_ROLES.includes(r));
  if (!ok) return res.status(403).json({ message: "School admin access required" });
  next();
}

const filterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  locationId: z.coerce.number().optional(),
  grade: z.string().optional(),
  gender: z.string().optional(),
  ageBand: z.string().optional(),
  teacherId: z.coerce.number().optional(),
});

function parseFilters(query: unknown): AnalyticsFilters {
  const parsed = filterSchema.safeParse(query);
  if (!parsed.success) return {};
  const f: AnalyticsFilters = {};
  if (parsed.data.from) f.from = new Date(parsed.data.from);
  if (parsed.data.to) f.to = new Date(parsed.data.to);
  if (parsed.data.locationId) f.locationId = parsed.data.locationId;
  if (parsed.data.grade) f.grade = parsed.data.grade;
  if (parsed.data.gender) f.gender = parsed.data.gender;
  if (parsed.data.ageBand) f.ageBand = parsed.data.ageBand;
  if (parsed.data.teacherId) f.teacherId = parsed.data.teacherId;
  return f;
}

router.get("/engagement", supabaseAuth, requireSchoolContext, requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = Number((req as any).schoolId);
    const data = await buildEngagementAnalytics(schoolId, parseFilters(req.query));
    res.json(data);
  } catch (e) {
    console.error("school analytics engagement:", e);
    res.status(500).json({ message: "Failed to load engagement analytics" });
  }
});

router.get("/cart-abandonment", supabaseAuth, requireSchoolContext, requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = Number((req as any).schoolId);
    const data = await buildCartAbandonmentAnalytics(schoolId, parseFilters(req.query));
    res.json(data);
  } catch (e) {
    console.error("school analytics cart:", e);
    res.status(500).json({ message: "Failed to load cart abandonment analytics" });
  }
});

export default router;
