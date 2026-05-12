import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import {
  insertDailyFlowEntrySchema,
  insertDailyFlowScheduleSchema,
  insertDailyFlowTemplateSchema,
} from "@shared/schema";

const router = Router();

function parseId(param: string | undefined): number | null {
  if (param === undefined) return null;
  const n = Number(param);
  return Number.isFinite(n) ? n : null;
}

// --- Templates ---

router.get("/templates", supabaseAuth, async (req, res) => {
  try {
    const schoolIdRaw = req.query.schoolId;
    const schoolId =
      typeof schoolIdRaw === "string" && schoolIdRaw !== ""
        ? Number(schoolIdRaw)
        : undefined;
    const gradeLevel =
      typeof req.query.gradeLevel === "string" ? req.query.gradeLevel : undefined;
    const subject = typeof req.query.subject === "string" ? req.query.subject : undefined;

    const filters: { schoolId?: number; gradeLevel?: string; subject?: string } = {};
    if (schoolId !== undefined && !Number.isNaN(schoolId)) filters.schoolId = schoolId;
    if (gradeLevel) filters.gradeLevel = gradeLevel;
    if (subject) filters.subject = subject;

    const list = await storage.getDailyFlowTemplates(
      Object.keys(filters).length ? filters : undefined,
    );
    res.json(list);
  } catch (error) {
    console.error("daily-flows GET /templates:", error);
    res.status(500).json({ error: "Failed to list daily flow templates" });
  }
});

router.get("/templates/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid template id" });
  const row = await storage.getDailyFlowTemplateById(id);
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(row);
});

router.post("/templates", supabaseAuth, async (req, res) => {
  try {
    const body = insertDailyFlowTemplateSchema.parse(req.body);
    const created = await storage.createDailyFlowTemplate(body);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows POST /templates:", error);
    res.status(500).json({ error: "Failed to create daily flow template" });
  }
});

router.patch("/templates/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid template id" });
  try {
    const partial = insertDailyFlowTemplateSchema.partial().parse(req.body);
    const updated = await storage.updateDailyFlowTemplate(id, partial);
    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows PATCH /templates/:id:", error);
    res.status(500).json({ error: "Failed to update daily flow template" });
  }
});

router.delete("/templates/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid template id" });
  await storage.deleteDailyFlowTemplate(id);
  res.status(204).end();
});

// --- Entries ---

router.get("/entries", supabaseAuth, async (req, res) => {
  try {
    const classIdRaw = req.query.classId;
    const classId =
      typeof classIdRaw === "string" && classIdRaw !== "" ? Number(classIdRaw) : undefined;
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    const filters: { classId?: number; startDate?: string; endDate?: string } = {};
    if (classId !== undefined && !Number.isNaN(classId)) filters.classId = classId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const list = await storage.getDailyFlowEntries(
      Object.keys(filters).length ? filters : undefined,
    );
    res.json(list);
  } catch (error) {
    console.error("daily-flows GET /entries:", error);
    res.status(500).json({ error: "Failed to list daily flow entries" });
  }
});

router.get("/entries/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid entry id" });
  const row = await storage.getDailyFlowEntryById(id);
  if (!row) return res.status(404).json({ error: "Entry not found" });
  res.json(row);
});

router.post("/entries", supabaseAuth, async (req, res) => {
  try {
    const body = insertDailyFlowEntrySchema.parse(req.body);
    const created = await storage.createDailyFlowEntry(body);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows POST /entries:", error);
    res.status(500).json({ error: "Failed to create daily flow entry" });
  }
});

router.patch("/entries/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid entry id" });
  try {
    const partial = insertDailyFlowEntrySchema.partial().parse(req.body);
    const updated = await storage.updateDailyFlowEntry(id, partial);
    if (!updated) return res.status(404).json({ error: "Entry not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows PATCH /entries/:id:", error);
    res.status(500).json({ error: "Failed to update daily flow entry" });
  }
});

router.delete("/entries/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid entry id" });
  await storage.deleteDailyFlowEntry(id);
  res.status(204).end();
});

// --- Schedules ---

router.get("/schedules", supabaseAuth, async (req, res) => {
  try {
    const templateIdRaw = req.query.templateId;
    const templateId =
      typeof templateIdRaw === "string" && templateIdRaw !== ""
        ? Number(templateIdRaw)
        : undefined;
    const classIdRaw = req.query.classId;
    const classId =
      typeof classIdRaw === "string" && classIdRaw !== "" ? Number(classIdRaw) : undefined;

    const filters: { templateId?: number; classId?: number } = {};
    if (templateId !== undefined && !Number.isNaN(templateId)) filters.templateId = templateId;
    if (classId !== undefined && !Number.isNaN(classId)) filters.classId = classId;

    const list = await storage.getDailyFlowSchedules(
      Object.keys(filters).length ? filters : undefined,
    );
    res.json(list);
  } catch (error) {
    console.error("daily-flows GET /schedules:", error);
    res.status(500).json({ error: "Failed to list daily flow schedules" });
  }
});

router.get("/schedules/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid schedule id" });
  const row = await storage.getDailyFlowScheduleById(id);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  res.json(row);
});

router.post("/schedules", supabaseAuth, async (req, res) => {
  try {
    const body = insertDailyFlowScheduleSchema.parse(req.body);
    const created = await storage.createDailyFlowSchedule(body);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows POST /schedules:", error);
    res.status(500).json({ error: "Failed to create daily flow schedule" });
  }
});

router.patch("/schedules/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid schedule id" });
  try {
    const partial = insertDailyFlowScheduleSchema.partial().parse(req.body);
    const updated = await storage.updateDailyFlowSchedule(id, partial);
    if (!updated) return res.status(404).json({ error: "Schedule not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows PATCH /schedules/:id:", error);
    res.status(500).json({ error: "Failed to update daily flow schedule" });
  }
});

router.delete("/schedules/:id", supabaseAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Invalid schedule id" });
  await storage.deleteDailyFlowSchedule(id);
  res.status(204).end();
});

const generateBodySchema = z.object({
  templateId: z.number().int().positive(),
  classId: z.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

router.post("/generate-entries", supabaseAuth, async (req: any, res) => {
  try {
    const body = generateBodySchema.parse(req.body);
    const email = req.user?.email as string | undefined;
    if (!email) {
      return res.status(401).json({ error: "Authenticated user email required" });
    }
    const entries = await storage.generateDailyFlowEntriesFromTemplate({
      ...body,
      createdBy: email,
    });
    res.status(201).json(entries);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }
    console.error("daily-flows POST /generate-entries:", error);
    res.status(500).json({
      error: "Failed to generate entries",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/stats", supabaseAuth, async (req, res) => {
  try {
    const classIdRaw = req.query.classId;
    const classId =
      typeof classIdRaw === "string" && classIdRaw !== "" ? Number(classIdRaw) : undefined;
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    const filters: { classId?: number; startDate?: string; endDate?: string } = {};
    if (classId !== undefined && !Number.isNaN(classId)) filters.classId = classId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const stats = await storage.getDailyFlowStats(
      Object.keys(filters).length ? filters : undefined,
    );
    res.json(stats);
  } catch (error) {
    console.error("daily-flows GET /stats:", error);
    res.status(500).json({ error: "Failed to load daily flow stats" });
  }
});

export default router;
