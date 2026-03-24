import { Router } from "express";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import {
  insertWeeklySkeletonSchema,
  insertSkeletonBlockSchema,
  insertWeekPlanSchema,
  insertWeekPlanBlockSchema,
} from "@shared/schema";
import { fileUploadService } from "../services/fileUploadService";
import { parse as parseCSV } from "csv-parse/sync";
import { UploadedFile } from "express-fileupload";

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const DAY_NUMBER_TO_NAME: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};
const VALID_BLOCK_TYPES = ["anchor", "curriculum", "flexible"];

const router = Router();

// ============================================================
// WEEKLY SKELETONS
// ============================================================

router.get(
  "/skeletons",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      if (isNaN(schoolId)) return res.status(400).json({ message: "Invalid school ID" });
      const skeletons = await storage.getWeeklySkeletonsBySchool(schoolId);
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const userId = req.user?.id;
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const assignedClassIds = new Set(assignments.map((a: any) => a.classId));
        const filtered = await Promise.all(
          skeletons.map(async (s) => {
            if (!s.classId) return s;
            if (assignedClassIds.has(s.classId)) return s;
            const classInfo = await storage.getClassById(s.classId);
            if (classInfo?.instructorId === userId) return s;
            return null;
          })
        );
        return res.json(filtered.filter(Boolean));
      }
      res.json(skeletons);
    } catch (error) {
      console.error("Error fetching skeletons:", error);
      res.status(500).json({ message: "Failed to fetch skeletons" });
    }
  }
);

router.get(
  "/skeletons/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(id);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole) && skeleton.classId) {
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const assigned = assignments.some((a) => a.classId === skeleton.classId);
        const classInfo = skeleton.classId ? await storage.getClassById(skeleton.classId) : null;
        const isInstructor = classInfo?.instructorId === userId;
        if (!assigned && !isInstructor) return res.status(403).json({ message: "Access denied" });
      }
      res.json(skeleton);
    } catch (error) {
      console.error("Error fetching skeleton:", error);
      res.status(500).json({ message: "Failed to fetch skeleton" });
    }
  }
);

router.post(
  "/skeletons",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      const userId = req.user?.id;
      if (isNaN(schoolId) || !userId) return res.status(400).json({ message: "Missing context" });
      const data = insertWeeklySkeletonSchema.parse({
        ...req.body,
        schoolId,
        createdBy: userId,
      });
      const skeleton = await storage.createWeeklySkeleton(data);
      res.status(201).json(skeleton);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating skeleton:", error);
      res.status(500).json({ message: "Failed to create skeleton" });
    }
  }
);

router.patch(
  "/skeletons/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const existing = await storage.getWeeklySkeletonById(id);
      if (!existing) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (existing.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const updated = await storage.updateWeeklySkeleton(id, {
        ...req.body,
        updatedBy: req.user?.id,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating skeleton:", error);
      res.status(500).json({ message: "Failed to update skeleton" });
    }
  }
);

router.delete(
  "/skeletons/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const existing = await storage.getWeeklySkeletonById(id);
      if (!existing) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (existing.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteWeeklySkeleton(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting skeleton:", error);
      res.status(500).json({ message: "Failed to delete skeleton" });
    }
  }
);

// ============================================================
// SKELETON BLOCKS
// ============================================================

router.get(
  "/skeletons/:skeletonId/blocks",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole) && skeleton.classId) {
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const assigned = assignments.some((a) => a.classId === skeleton.classId);
        const classInfo = await storage.getClassById(skeleton.classId);
        const isInstructor = classInfo?.instructorId === userId;
        if (!assigned && !isInstructor) return res.status(403).json({ message: "Access denied" });
      }
      const blocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching skeleton blocks:", error);
      res.status(500).json({ message: "Failed to fetch skeleton blocks" });
    }
  }
);

router.post(
  "/skeletons/:skeletonId/blocks",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      const userId = req.user?.id;
      if (isNaN(skeletonId) || !userId) return res.status(400).json({ message: "Missing context" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      // Auto-assign sortOrder based on existing blocks for this day
      const existingBlocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);
      const dayOfWeek = req.body.dayOfWeek !== undefined ? parseInt(req.body.dayOfWeek) : undefined;
      const maxSortOrder = existingBlocks
        .filter((b) => b.dayOfWeek === dayOfWeek)
        .reduce((max, b) => Math.max(max, b.sortOrder), -1);
      const sortOrder = req.body.sortOrder !== undefined ? parseInt(req.body.sortOrder) : maxSortOrder + 1;

      const data = insertSkeletonBlockSchema.parse({
        ...req.body,
        skeletonId,
        createdBy: userId,
        sortOrder,
      });
      const block = await storage.createSkeletonBlock(data);
      res.status(201).json(block);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating skeleton block:", error);
      res.status(500).json({ message: "Failed to create skeleton block" });
    }
  }
);

router.patch(
  "/skeletons/:skeletonId/blocks/:blockId",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const blockId = parseInt(req.params.blockId);
      if (isNaN(blockId)) return res.status(400).json({ message: "Invalid block ID" });
      const block = await storage.getSkeletonBlockById(blockId);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const skeleton = await storage.getWeeklySkeletonById(block.skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const updated = await storage.updateSkeletonBlock(blockId, {
        ...req.body,
        updatedBy: req.user?.id,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating skeleton block:", error);
      res.status(500).json({ message: "Failed to update skeleton block" });
    }
  }
);

router.delete(
  "/skeletons/:skeletonId/blocks/:blockId",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const blockId = parseInt(req.params.blockId);
      if (isNaN(blockId)) return res.status(400).json({ message: "Invalid block ID" });
      const block = await storage.getSkeletonBlockById(blockId);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const skeleton = await storage.getWeeklySkeletonById(block.skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteSkeletonBlock(blockId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting skeleton block:", error);
      res.status(500).json({ message: "Failed to delete skeleton block" });
    }
  }
);

router.post(
  "/skeletons/:skeletonId/blocks/reorder",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const { blockIds } = req.body;
      if (!Array.isArray(blockIds)) return res.status(400).json({ message: "blockIds must be an array" });
      await storage.reorderSkeletonBlocks(skeletonId, blockIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering blocks:", error);
      res.status(500).json({ message: "Failed to reorder blocks" });
    }
  }
);

// ============================================================
// SKELETON BLOCK CSV EXPORT & IMPORT
// ============================================================

router.get(
  "/skeletons/:skeletonId/blocks/export-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']),
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      const blocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);
      const sorted = [...blocks].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });

      const headerRow = "day_of_week,start_time,end_time,block_type,default_title,subject_area,sort_order";
      const hintRow = "# e.g. Monday,08:00,09:00,curriculum,Math Block,Mathematics,0  (block_type must be: anchor | curriculum | flexible)";

      const dataRows = sorted.map((b) => {
        const dayName = DAY_NUMBER_TO_NAME[b.dayOfWeek] || b.dayOfWeek;
        const title = (b.defaultTitle || "").replace(/"/g, '""');
        const subject = (b.subjectArea || "").replace(/"/g, '""');
        return `${dayName},${b.startTime},${b.endTime},${b.blockType},"${title}","${subject}",${b.sortOrder}`;
      });

      const csv = [headerRow, hintRow, ...dataRows].join("\n");
      const filename = `skeleton_blocks_${skeleton.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting skeleton blocks CSV:", error);
      res.status(500).json({ message: "Failed to export skeleton blocks" });
    }
  }
);

router.post(
  "/skeletons/:skeletonId/blocks/import-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;

      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uploadedFile = req.files.file as UploadedFile;
      if (!uploadedFile.name.toLowerCase().endsWith(".csv")) {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }

      const fileContent = uploadedFile.data.toString("utf-8");
      const allLines = fileContent.split("\n");
      const filteredLines = allLines.filter((line) => !line.trim().startsWith("#") && line.trim() !== "");
      const filteredContent = filteredLines.join("\n");

      let records: any[];
      try {
        records = parseCSV(filteredContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (parseError: any) {
        return res.status(400).json({ message: "Failed to parse CSV: " + parseError.message });
      }

      if (records.length === 0) {
        return res.status(400).json({ message: "CSV file contains no data rows" });
      }

      const errors: string[] = [];
      const parsed: Array<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        blockType: string;
        defaultTitle: string;
        subjectArea: string | null;
        sortOrder: number;
      }> = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;
        const dayRaw = (row.day_of_week || "").trim();
        const dayNum = DAY_NAME_TO_NUMBER[dayRaw];
        if (dayNum === undefined) {
          errors.push(`Row ${rowNum}: Invalid day_of_week "${dayRaw}". Must be a day name like Monday.`);
          continue;
        }
        const startTime = (row.start_time || "").trim();
        const endTime = (row.end_time || "").trim();
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
          errors.push(`Row ${rowNum}: Invalid start_time "${startTime}". Must be HH:MM format.`);
          continue;
        }
        if (!/^\d{2}:\d{2}$/.test(endTime)) {
          errors.push(`Row ${rowNum}: Invalid end_time "${endTime}". Must be HH:MM format.`);
          continue;
        }
        if (endTime <= startTime) {
          errors.push(`Row ${rowNum}: end_time must be after start_time.`);
          continue;
        }
        const blockType = (row.block_type || "").trim().toLowerCase();
        if (!VALID_BLOCK_TYPES.includes(blockType)) {
          errors.push(`Row ${rowNum}: Invalid block_type "${blockType}". Must be anchor, curriculum, or flexible.`);
          continue;
        }
        const defaultTitle = (row.default_title || "").trim();
        if (!defaultTitle) {
          errors.push(`Row ${rowNum}: default_title is required.`);
          continue;
        }
        const subjectArea = (row.subject_area || "").trim() || null;
        const sortOrder = row.sort_order !== undefined && row.sort_order !== "" ? parseInt(row.sort_order) : i;

        parsed.push({ dayOfWeek: dayNum, startTime, endTime, blockType, defaultTitle, subjectArea, sortOrder: isNaN(sortOrder) ? i : sortOrder });
      }

      if (errors.length > 0) {
        return res.status(422).json({ message: "Validation errors in CSV", errors });
      }

      const overlapErrors: string[] = [];
      const byDay: Record<number, typeof parsed> = {};
      for (const b of parsed) {
        if (!byDay[b.dayOfWeek]) byDay[b.dayOfWeek] = [];
        const dayBlocks = byDay[b.dayOfWeek];
        const overlapping = dayBlocks.find((ex) => b.startTime < ex.endTime && b.endTime > ex.startTime);
        if (overlapping) {
          overlapErrors.push(`Overlap on ${DAY_NUMBER_TO_NAME[b.dayOfWeek]}: "${b.defaultTitle}" (${b.startTime}–${b.endTime}) overlaps with "${overlapping.defaultTitle}" (${overlapping.startTime}–${overlapping.endTime})`);
        } else {
          dayBlocks.push(b);
        }
      }

      if (overlapErrors.length > 0) {
        return res.status(422).json({ message: "Overlapping blocks detected", errors: overlapErrors });
      }

      const existingBlocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);
      for (const block of existingBlocks) {
        await storage.deleteSkeletonBlock(block.id);
      }

      const created = [];
      for (const b of parsed) {
        const newBlock = await storage.createSkeletonBlock({
          skeletonId,
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
          blockType: b.blockType,
          defaultTitle: b.defaultTitle,
          defaultDescription: null,
          subjectArea: b.subjectArea,
          sortOrder: b.sortOrder,
          createdBy: userId,
        });
        created.push(newBlock);
      }

      res.json({ message: `Successfully imported ${created.length} blocks`, count: created.length });
    } catch (error: any) {
      console.error("Error importing skeleton blocks CSV:", error);
      res.status(500).json({ message: "Failed to import skeleton blocks" });
    }
  }
);

// ============================================================
// WEEK PLANS
// ============================================================

router.get(
  "/skeletons/:skeletonId/week-plans",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole) && skeleton.classId) {
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const assigned = assignments.some((a) => a.classId === skeleton.classId);
        const classInfo = await storage.getClassById(skeleton.classId);
        const isInstructor = classInfo?.instructorId === userId;
        if (!assigned && !isInstructor) return res.status(403).json({ message: "Access denied" });
      }
      const plans = await storage.getWeekPlansBySkeletonId(skeletonId);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching week plans:", error);
      res.status(500).json({ message: "Failed to fetch week plans" });
    }
  }
);

router.get(
  "/week-plans/published",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      if (isNaN(schoolId)) return res.status(400).json({ message: "Invalid school ID" });
      const plans = await storage.getPublishedWeekPlansBySchool(schoolId);
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const userId = req.user?.id;
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const assignedClassIds = new Set(assignments.map((a: any) => a.classId));
        const filtered = await Promise.all(
          plans.map(async (p) => {
            const skeleton = await storage.getWeeklySkeletonById(p.skeletonId);
            if (!skeleton?.classId) return p;
            if (assignedClassIds.has(skeleton.classId)) return p;
            const classInfo = await storage.getClassById(skeleton.classId);
            if (classInfo?.instructorId === userId) return p;
            return null;
          })
        );
        return res.json(filtered.filter(Boolean));
      }
      res.json(plans);
    } catch (error) {
      console.error("Error fetching published week plans:", error);
      res.status(500).json({ message: "Failed to fetch published week plans" });
    }
  }
);

router.get(
  "/week-plans/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
        if (skeleton?.classId) {
          const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
          const assigned = assignments.some((a) => a.classId === skeleton.classId);
          const classInfo = await storage.getClassById(skeleton.classId);
          const isInstructor = classInfo?.instructorId === userId;
          if (!assigned && !isInstructor) return res.status(403).json({ message: "Access denied" });
        }
      }
      const blocks = await storage.getWeekPlanBlocksByWeekPlanId(id);
      res.json({ ...plan, blocks });
    } catch (error) {
      console.error("Error fetching week plan:", error);
      res.status(500).json({ message: "Failed to fetch week plan" });
    }
  }
);

router.post(
  "/week-plans",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      const userId = req.user?.id;
      if (isNaN(schoolId) || !userId) return res.status(400).json({ message: "Missing context" });
      const data = insertWeekPlanSchema.parse({
        ...req.body,
        schoolId,
        createdBy: userId,
      });
      const plan = await storage.createWeekPlan(data);
      res.status(201).json(plan);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating week plan:", error);
      res.status(500).json({ message: "Failed to create week plan" });
    }
  }
);

router.patch(
  "/week-plans/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const existing = await storage.getWeekPlanById(id);
      if (!existing) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (existing.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const updated = await storage.updateWeekPlan(id, {
        ...req.body,
        updatedBy: req.user?.id,
      });

      if (req.body.status === "published" && existing.status !== "published") {
        try {
          const skeleton = await storage.getWeeklySkeletonById(existing.skeletonId);
          const notifData: any = {
            senderId: req.user?.id,
            schoolId: schoolId,
            type: "in_app",
            subject: "Weekly Schedule Published",
            content: `Week ${existing.weekNumber} schedule${skeleton ? ` for ${skeleton.gradeLevel}` : ''} has been published. View the updated lesson plan.`,
            targetType: "all_parents",
            targetData: { schoolId, weekNumber: existing.weekNumber, skeletonId: existing.skeletonId },
            status: "sent",
            scheduledFor: null,
            expiresAt: null,
          };
          const notification = await storage.createNotification(notifData);
          console.log(`Schedule publish notification created: ${notification.id}`);
        } catch (notifError) {
          console.error("Error creating publish notification:", notifError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating week plan:", error);
      res.status(500).json({ message: "Failed to update week plan" });
    }
  }
);

router.delete(
  "/week-plans/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const existing = await storage.getWeekPlanById(id);
      if (!existing) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (existing.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteWeekPlan(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting week plan:", error);
      res.status(500).json({ message: "Failed to delete week plan" });
    }
  }
);

router.post(
  "/week-plans/:id/clone",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const sourceId = parseInt(req.params.id);
      const userId = req.user?.id;
      if (isNaN(sourceId) || !userId) return res.status(400).json({ message: "Missing context" });
      const existing = await storage.getWeekPlanById(sourceId);
      if (!existing) return res.status(404).json({ message: "Source week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (existing.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const { weekNumber, weekStartDate } = req.body;
      if (!weekNumber || !weekStartDate) return res.status(400).json({ message: "weekNumber and weekStartDate required" });
      const cloned = await storage.cloneWeekPlan(sourceId, weekNumber, weekStartDate, userId);
      res.status(201).json(cloned);
    } catch (error) {
      console.error("Error cloning week plan:", error);
      res.status(500).json({ message: "Failed to clone week plan" });
    }
  }
);

// ============================================================
// WEEK PLAN CSV EXPORT & IMPORT
// ============================================================

router.get(
  "/week-plans/:id/blocks/export-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']),
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId);
      const weekPlanBlocks = await storage.getWeekPlanBlocksByWeekPlanId(id);

      const weekBlockBySkeletonId: Record<number, any> = {};
      for (const wb of weekPlanBlocks) {
        weekBlockBySkeletonId[wb.skeletonBlockId] = wb;
      }

      const sorted = [...skeletonBlocks].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });

      const headerRow = "day_of_week,start_time,end_time,block_type,title,description,objectives,lesson_link,notes";
      const hintRow = "# day_of_week=Monday; objectives are semicolon-separated; title/description/lesson_link/notes are optional overrides";

      const dataRows = sorted.map((sb) => {
        const wb = weekBlockBySkeletonId[sb.id];
        const dayName = DAY_NUMBER_TO_NAME[sb.dayOfWeek] || sb.dayOfWeek;
        const title = ((wb?.title || sb.defaultTitle || "")).replace(/"/g, '""');
        const description = ((wb?.description || sb.defaultDescription || "")).replace(/"/g, '""');
        const objectives = Array.isArray(wb?.objectives) ? (wb.objectives as string[]).join(";") : "";
        const lessonLink = (wb?.lessonLink || "").replace(/"/g, '""');
        const notes = (wb?.notes || "").replace(/"/g, '""');
        return `${dayName},${sb.startTime},${sb.endTime},${sb.blockType},"${title}","${description}","${objectives}","${lessonLink}","${notes}"`;
      });

      const csv = [headerRow, hintRow, ...dataRows].join("\n");
      const weekName = skeleton ? `${skeleton.name}_week${plan.weekNumber}` : `week_plan_${id}`;
      const filename = `week_plan_${weekName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting week plan CSV:", error);
      res.status(500).json({ message: "Failed to export week plan blocks" });
    }
  }
);

router.post(
  "/week-plans/:id/blocks/import-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director', 'educator', 'mentor', 'teacher']),
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;

      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uploadedFile = req.files.file as UploadedFile;
      if (!uploadedFile.name.toLowerCase().endsWith(".csv")) {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }

      const fileContent = uploadedFile.data.toString("utf-8");
      const allLines = fileContent.split("\n");
      const filteredLines = allLines.filter((line) => !line.trim().startsWith("#") && line.trim() !== "");
      const filteredContent = filteredLines.join("\n");

      let records: any[];
      try {
        records = parseCSV(filteredContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (parseError: any) {
        return res.status(400).json({ message: "Failed to parse CSV: " + parseError.message });
      }

      if (records.length === 0) {
        return res.status(400).json({ message: "CSV file contains no data rows" });
      }

      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId);
      const existingWeekBlocks = await storage.getWeekPlanBlocksByWeekPlanId(id);

      const weekBlockBySkeletonId: Record<number, any> = {};
      for (const wb of existingWeekBlocks) {
        weekBlockBySkeletonId[wb.skeletonBlockId] = wb;
      }

      const errors: string[] = [];
      const updates: Array<{
        skeletonBlock: any;
        weekBlock?: any;
        title: string | null;
        description: string | null;
        objectives: string[];
        lessonLink: string | null;
        notes: string | null;
      }> = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;
        const dayRaw = (row.day_of_week || "").trim();
        const dayNum = DAY_NAME_TO_NUMBER[dayRaw];
        if (dayNum === undefined) {
          errors.push(`Row ${rowNum}: Invalid day_of_week "${dayRaw}".`);
          continue;
        }
        const startTime = (row.start_time || "").trim();
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
          errors.push(`Row ${rowNum}: Invalid start_time "${startTime}". Must be HH:MM.`);
          continue;
        }
        const sb = skeletonBlocks.find((b) => b.dayOfWeek === dayNum && b.startTime === startTime);
        if (!sb) {
          errors.push(`Row ${rowNum}: No skeleton block found for ${dayRaw} at ${startTime}.`);
          continue;
        }
        const title = (row.title || "").trim() || null;
        const description = (row.description || "").trim() || null;
        const objectivesRaw = (row.objectives || "").trim();
        const objectives = objectivesRaw ? objectivesRaw.split(";").map((o: string) => o.trim()).filter(Boolean) : [];
        const lessonLink = (row.lesson_link || "").trim() || null;
        const notes = (row.notes || "").trim() || null;

        updates.push({
          skeletonBlock: sb,
          weekBlock: weekBlockBySkeletonId[sb.id],
          title, description, objectives, lessonLink, notes,
        });
      }

      if (errors.length > 0) {
        return res.status(422).json({ message: "Validation errors in CSV", errors });
      }

      let updatedCount = 0;
      let createdCount = 0;
      for (const u of updates) {
        const payload = {
          title: u.title,
          description: u.description,
          objectives: u.objectives,
          lessonLink: u.lessonLink,
          notes: u.notes,
        };
        if (u.weekBlock) {
          await storage.updateWeekPlanBlock(u.weekBlock.id, payload, userId);
          updatedCount++;
        } else {
          await storage.createWeekPlanBlock({
            weekPlanId: id,
            skeletonBlockId: u.skeletonBlock.id,
            title: u.title,
            description: u.description,
            objectives: u.objectives,
            lessonLink: u.lessonLink,
            notes: u.notes,
            groups: [],
            isCompleted: false,
          });
          createdCount++;
        }
      }

      res.json({
        message: `Import complete: ${updatedCount} blocks updated, ${createdCount} blocks created`,
        updatedCount,
        createdCount,
      });
    } catch (error: any) {
      console.error("Error importing week plan blocks CSV:", error);
      res.status(500).json({ message: "Failed to import week plan blocks" });
    }
  }
);

// ============================================================
// WEEK PLAN BLOCKS
// ============================================================

router.get(
  "/week-plans/:weekPlanId/blocks",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const weekPlanId = parseInt(req.params.weekPlanId);
      if (isNaN(weekPlanId)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
        if (skeleton?.classId) {
          const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
          const assigned = assignments.some((a) => a.classId === skeleton.classId);
          const classInfo = await storage.getClassById(skeleton.classId);
          const isInstructor = classInfo?.instructorId === userId;
          if (!assigned && !isInstructor) return res.status(403).json({ message: "Access denied" });
        }
      }
      const blocks = await storage.getWeekPlanBlocksByWeekPlanId(weekPlanId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching week plan blocks:", error);
      res.status(500).json({ message: "Failed to fetch week plan blocks" });
    }
  }
);

router.post(
  "/week-plans/:weekPlanId/blocks",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const weekPlanId = parseInt(req.params.weekPlanId);
      const userId = req.user?.id;
      if (isNaN(weekPlanId) || !userId) return res.status(400).json({ message: "Missing context" });
      const plan = await storage.getWeekPlanById(weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const data = insertWeekPlanBlockSchema.parse({
        ...req.body,
        weekPlanId,
      });
      const block = await storage.createWeekPlanBlock(data);
      res.status(201).json(block);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating week plan block:", error);
      res.status(500).json({ message: "Failed to create week plan block" });
    }
  }
);

router.patch(
  "/week-plan-blocks/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      if (isNaN(id) || !userId) return res.status(400).json({ message: "Missing context" });
      const block = await storage.getWeekPlanBlockById(id);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const plan = await storage.getWeekPlanById(block.weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const hasAccess = skeleton?.classId == null || assignments.some((a: any) => a.classId === skeleton.classId) || (skeleton?.classId && (await storage.getClassById(skeleton.classId))?.instructorId === userId);
        if (!hasAccess) return res.status(403).json({ message: "Not authorized for this class" });
        console.log("Educator access granted for user", req.user?.id);
      }
      const updated = await storage.updateWeekPlanBlock(id, req.body, userId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating week plan block:", error);
      res.status(500).json({ message: "Failed to update week plan block" });
    }
  }
);

router.delete(
  "/week-plan-blocks/:id",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid block ID" });
      const block = await storage.getWeekPlanBlockById(id);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const plan = await storage.getWeekPlanById(block.weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteWeekPlanBlock(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting week plan block:", error);
      res.status(500).json({ message: "Failed to delete week plan block" });
    }
  }
);

router.post(
  "/week-plan-blocks/:id/complete",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      if (isNaN(id) || !userId) return res.status(400).json({ message: "Missing context" });
      const block = await storage.getWeekPlanBlockById(id);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const plan = await storage.getWeekPlanById(block.weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
        const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
        const hasAccess = skeleton?.classId == null || assignments.some((a: any) => a.classId === skeleton.classId) || (skeleton?.classId && (await storage.getClassById(skeleton.classId))?.instructorId === userId);
        if (!hasAccess) return res.status(403).json({ message: "Not authorized for this class" });
        console.log("Educator access granted for user", req.user?.id);
      }
      const updated = await storage.markBlockCompleted(id, userId);
      res.json(updated);
    } catch (error) {
      console.error("Error marking block complete:", error);
      res.status(500).json({ message: "Failed to mark block complete" });
    }
  }
);

// ============================================================
// BLOCK HISTORY
// ============================================================

router.get(
  "/week-plan-blocks/:id/history",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'educator', 'mentor', 'teacher', 'director']), // director has schedule-builder-level access
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      if (isNaN(id)) return res.status(400).json({ message: "Invalid block ID" });
      const block = await storage.getWeekPlanBlockById(id);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const plan = await storage.getWeekPlanById(block.weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const userRole = req.user?.role;
      if (userRole && ['educator', 'mentor', 'teacher'].includes(userRole)) {
        const skeleton = await storage.getWeeklySkeletonById(plan.skeletonId);
        if (skeleton?.classId) {
          const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
          const assigned = assignments.some((a: any) => a.classId === skeleton.classId);
          const classInfo = await storage.getClassById(skeleton.classId);
          if (!assigned && classInfo?.instructorId !== userId) return res.status(403).json({ message: "Access denied" });
        }
      }
      const history = await storage.getBlockHistory(id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching block history:", error);
      res.status(500).json({ message: "Failed to fetch block history" });
    }
  }
);

// ============================================================
// FILE ATTACHMENTS (presigned URL flow)
// ============================================================

router.post(
  "/upload/request-url",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const { filename, contentType, sizeBytes } = req.body;
      if (!filename || !contentType || !sizeBytes) {
        return res.status(400).json({ message: "filename, contentType, and sizeBytes required" });
      }
      const result = await fileUploadService.getUploadUrl({
        category: "scheduleResources",
        filename,
        contentType,
        sizeBytes,
        userId: req.user?.id,
        schoolId: parseInt(req.schoolId),
      });
      if (!result.validation.valid) {
        return res.status(400).json({ message: result.validation.error });
      }
      res.json({
        uploadURL: result.uploadURL,
        objectPath: result.objectPath,
        metadata: { filename, sizeBytes, contentType, category: "scheduleResources" },
      });
    } catch (error: any) {
      console.error("Error requesting upload URL:", error);
      res.status(400).json({ message: error.message || "Failed to request upload URL" });
    }
  }
);

export default router;
