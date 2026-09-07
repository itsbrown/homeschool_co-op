import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import {
  listJurisdictions,
  getStandards,
  getKpiThresholds,
  resolveSchoolJurisdiction,
} from "../lib/education-standards";
import { ensureEducationStandardsSchema } from "../lib/ensure-education-standards-schema";

const router = Router();

async function ensureReady() {
  try {
    await ensureEducationStandardsSchema();
  } catch (e) {
    console.warn("[education-standards] ensure schema:", e);
  }
}

router.get("/jurisdictions", supabaseAuth, requireSchoolContext, async (_req: Request, res: Response) => {
  try {
    await ensureReady();
    const schoolId = Number((_req as any).schoolId);
    const resolved = await resolveSchoolJurisdiction(schoolId);
    const jurisdictions = await listJurisdictions();
    res.json({ jurisdictions, resolved });
  } catch (e) {
    console.error("education-standards jurisdictions:", e);
    res.status(500).json({ message: "Failed to list jurisdictions" });
  }
});

const standardsQuery = z.object({
  jurisdictionCode: z.string().optional(),
  subject: z.enum(["ela", "math", "science", "social_studies"]).optional(),
  grade: z.string().optional(),
});

router.get("/", supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    await ensureReady();
    const schoolId = Number((req as any).schoolId);
    const parsed = standardsQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", errors: parsed.error.errors });
    }
    const resolved = await resolveSchoolJurisdiction(schoolId, parsed.data.jurisdictionCode);
    const data = await getStandards({
      jurisdictionCode: parsed.data.jurisdictionCode || resolved.code,
      subject: parsed.data.subject,
      grade: parsed.data.grade,
    });
    res.json(data);
  } catch (e) {
    console.error("education-standards list:", e);
    res.status(500).json({ message: "Failed to load standards" });
  }
});

const kpiQuery = z.object({
  jurisdictionCode: z.string().optional(),
  subject: z.enum(["ela", "math", "science", "social_studies"]).optional(),
});

router.get("/kpi-thresholds", supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    await ensureReady();
    const schoolId = Number((req as any).schoolId);
    const parsed = kpiQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", errors: parsed.error.errors });
    }
    const resolved = await resolveSchoolJurisdiction(schoolId, parsed.data.jurisdictionCode);
    const data = await getKpiThresholds({
      jurisdictionCode: parsed.data.jurisdictionCode || resolved.code,
      subject: parsed.data.subject || "ela",
      metric: "lexile",
    });
    res.json(data);
  } catch (e) {
    console.error("education-standards kpi:", e);
    res.status(500).json({ message: "Failed to load KPI thresholds" });
  }
});

export default router;
