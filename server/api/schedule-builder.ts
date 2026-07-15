/**
 * Schedule Builder API — Role Access Matrix (Additive Roles Phase 2)
 *
 * Write routes require ADMIN_ROLES: schoolAdmin | admin | superAdmin | director
 * Consumer read routes use CONSUMER_READ_ROLES (adds parent | teacher | educator):
 *   GET /week-plans/published, /week-plans/:id, /skeletons/:id, /skeletons/:id/blocks
 * Parent enrollment-scoped week plans: GET /parent/my-week-plans
 *
 * Test matrix (expected behavior):
 *   - Single-role educator (teacher): read published plans/skeletons; NO schedule builder write access.
 *   - Multi-role parent + director: full scheduler access via director.
 *   - schoolAdmin: behavior completely unchanged for writes.
 *
 * IMPORTANT: Never use requireAdmin — it uses 'school-admin' (hyphen) which does NOT match
 * the DB value 'schoolAdmin' (camelCase). Always use requireRole with explicit camelCase strings.
 *
 * School data isolation is enforced via requireSchoolContext which injects req.schoolId from
 * the database (never from JWT). All handlers verify resource.schoolId === req.schoolId.
 */

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
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
import { UploadedFile } from "express-fileupload";

const DAY_NUMBER_TO_NAME: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const BLOCK_TYPES = ["anchor", "curriculum", "flexible"] as const;

/** Accept Excel-style times (`8:45`, `9:00`) and normalize to `HH:MM`. */
function normalizeTimeHhMm(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const ADMIN_ROLES = ['schoolAdmin', 'admin', 'superAdmin', 'director'];
const CONSUMER_READ_ROLES = ['schoolAdmin', 'admin', 'superAdmin', 'director', 'parent', 'teacher', 'educator'];

function getMondayWeekStart(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isRtfOrBinary(buf: Buffer): boolean {
  // RTF starts with {\rtf
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '{\\rtf') return true;
  // Check for non-printable, non-UTF8-control bytes in first 512 bytes (binary detection)
  const sample = buf.slice(0, 512);
  let nonText = 0;
  for (const b of sample) {
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) nonText++;
  }
  return nonText > sample.length * 0.1;
}

/**
 * Middleware that logs when a director successfully passes a schedule builder check.
 * Only active in development. Must be placed after requireRole.
 */
function logDirectorAccess(req: any, res: any, next: any) {
  if (process.env.NODE_ENV === 'development') {
    const userRole: string = req.auth?.role || req.user?.role || '';
    const allRoles: string[] = req.user?.allRoles || [];
    if (userRole === 'director' || allRoles.includes('director')) {
      console.log("Director access granted for user", req.user?.id);
    }
  }
  next();
}

const router = Router();

// ============================================================
// WEEKLY SKELETONS
// ============================================================

router.get(
  "/skeletons",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      if (isNaN(schoolId)) return res.status(400).json({ message: "Invalid school ID" });
      const skeletons = await storage.getWeeklySkeletonsBySchool(schoolId);
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
  requireRole(CONSUMER_READ_ROLES),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(id);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(CONSUMER_READ_ROLES),
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
      const data = insertSkeletonBlockSchema.parse({
        ...req.body,
        skeletonId,
        createdBy: userId,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
// WEEK PLANS
// ============================================================

router.get(
  "/skeletons/:skeletonId/week-plans",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const skeletonId = parseInt(req.params.skeletonId);
      if (isNaN(skeletonId)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
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
  requireRole(CONSUMER_READ_ROLES),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      if (isNaN(schoolId)) return res.status(400).json({ message: "Invalid school ID" });
      const plans = await storage.getPublishedWeekPlansBySchool(schoolId);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching published week plans:", error);
      res.status(500).json({ message: "Failed to fetch published week plans" });
    }
  }
);

router.get(
  "/parent/my-week-plans",
  supabaseAuth,
  requireRole(['parent', 'schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const schoolId = parseInt(req.schoolId);
      if (isNaN(schoolId)) return res.status(400).json({ message: "Invalid school ID" });

      const weekStartRaw = typeof req.query.weekStart === "string" ? req.query.weekStart.trim() : "";
      const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)
        ? weekStartRaw
        : getMondayWeekStart();

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const children = await storage.getChildrenByParentId(userId);
      const childClassPairs: Array<{
        childId: number;
        childName: string;
        classId: number;
      }> = [];
      const allClassIds = new Set<number>();

      for (const child of children) {
        const enrollments = await storage.getEnrollmentsByChildId(child.id);
        const childClassIds = new Set<number>();
        for (const e of enrollments) {
          const effectiveClassId = e.marketplaceClassId ?? e.classId;
          if (effectiveClassId == null) continue;
          const classId = Number(effectiveClassId);
          if (isNaN(classId) || childClassIds.has(classId)) continue;
          childClassIds.add(classId);
          allClassIds.add(classId);
          const childName = [child.firstName, child.lastName].filter(Boolean).join(" ").trim()
            || `Child ${child.id}`;
          childClassPairs.push({
            childId: child.id,
            childName,
            classId,
          });
        }
      }

      const classIds = Array.from(allClassIds);
      const publishedPlans = await storage.getPublishedWeekPlansForClassIds(schoolId, classIds, weekStart);
      const plansByClassId = new Map<number, (typeof publishedPlans)[number]>();
      for (const plan of publishedPlans) {
        if (plan.classId != null && !plansByClassId.has(plan.classId)) {
          plansByClassId.set(plan.classId, plan);
        }
      }

      const skeletonCache = new Map<number, any>();
      const skeletonBlocksCache = new Map<number, any[]>();
      const weekPlanBlocksCache = new Map<number, any[]>();

      const childrenResponse = [];
      for (const pair of childClassPairs) {
        const plan = plansByClassId.get(pair.classId) || null;
        let blocks: any[] = [];
        let skeleton: any = null;
        let skeletonBlocks: any[] = [];

        if (plan) {
          if (!weekPlanBlocksCache.has(plan.id)) {
            weekPlanBlocksCache.set(plan.id, await storage.getWeekPlanBlocksByWeekPlanId(plan.id));
          }
          blocks = weekPlanBlocksCache.get(plan.id)!;

          if (plan.skeletonId) {
            if (!skeletonCache.has(plan.skeletonId)) {
              skeletonCache.set(plan.skeletonId, await storage.getWeeklySkeletonById(plan.skeletonId) || null);
            }
            skeleton = skeletonCache.get(plan.skeletonId) || null;

            if (!skeletonBlocksCache.has(plan.skeletonId)) {
              skeletonBlocksCache.set(
                plan.skeletonId,
                await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId),
              );
            }
            skeletonBlocks = skeletonBlocksCache.get(plan.skeletonId)!;
          }
        }

        const classTitle =
          plan?.classTitle
          || skeleton?.gradeLevel
          || `Class ${pair.classId}`;

        childrenResponse.push({
          childId: pair.childId,
          childName: pair.childName,
          classId: pair.classId,
          classTitle,
          weekPlan: plan
            ? (() => {
                const { classId: _c, classTitle: _t, skeletonName: _s, ...weekPlan } = plan as any;
                return weekPlan;
              })()
            : null,
          blocks,
          skeleton,
          skeletonBlocks,
        });
      }

      res.json({ weekStart, children: childrenResponse });
    } catch (error) {
      console.error("Error fetching parent week plans:", error);
      res.status(500).json({ message: "Failed to fetch parent week plans" });
    }
  }
);

router.get(
  "/week-plans/:id",
  supabaseAuth,
  requireRole(CONSUMER_READ_ROLES),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
// WEEK PLAN BLOCKS
// ============================================================

router.get(
  "/week-plans/:weekPlanId/blocks",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const weekPlanId = parseInt(req.params.weekPlanId);
      if (isNaN(weekPlanId)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']), // director has full schedule-builder access
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
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
      const history = await storage.getBlockHistory(id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching block history:", error);
      res.status(500).json({ message: "Failed to fetch block history" });
    }
  }
);

// ============================================================
// SKELETON BLOCKS - CSV EXPORT & IMPORT
// ============================================================

router.get(
  "/skeletons/:id/blocks/export-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(id);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      const blocks = await storage.getSkeletonBlocksBySkeletonId(id);
      const header = ["day_of_week", "start_time", "end_time", "block_type", "default_title", "subject_area", "sort_order"];
      const hintRow = ["Monday", "08:00", "09:00", "curriculum", "Math 101", "Math", "0"];

      const rows = blocks.map((b) => [
        DAY_NUMBER_TO_NAME[b.dayOfWeek] || String(b.dayOfWeek),
        b.startTime,
        b.endTime,
        b.blockType,
        b.defaultTitle,
        b.subjectArea || "",
        String(b.sortOrder),
      ]);

      const csv = csvStringify([header, hintRow, ...rows]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="skeleton-${id}-blocks.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting skeleton CSV:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  }
);

router.post(
  "/skeletons/:id/blocks/import-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid skeleton ID" });
      const skeleton = await storage.getWeeklySkeletonById(id);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const schoolId = parseInt(req.schoolId);
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uploadedFile = req.files.file as UploadedFile;
      if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }
      if (isRtfOrBinary(uploadedFile.data)) {
        return res.status(400).json({ message: "File appears to be binary or RTF. Only plain UTF-8 CSV files are supported." });
      }

      const content = uploadedFile.data.toString("utf-8");
      let records: any[];
      try {
        records = csvParse(content, { columns: true, skip_empty_lines: true, trim: true });
      } catch (e: any) {
        return res.status(400).json({ message: `CSV parse error: ${e.message}` });
      }

      if (records.length === 0) return res.status(400).json({ message: "CSV file is empty" });

      // Optional column mapping from FormData: { canonicalField: sourceHeader }
      let columnMapping: Record<string, string> | null = null;
      const rawMapping = req.body?.mapping;
      if (typeof rawMapping === "string" && rawMapping.trim()) {
        try {
          const parsedMapping = JSON.parse(rawMapping);
          if (parsedMapping && typeof parsedMapping === "object" && !Array.isArray(parsedMapping)) {
            columnMapping = parsedMapping as Record<string, string>;
          }
        } catch {
          return res.status(400).json({ message: "Invalid mapping JSON" });
        }
      }

      const remapRecord = (r: any): any => {
        if (!columnMapping) return r;
        const out: Record<string, string> = {};
        for (const [canonical, sourceCol] of Object.entries(columnMapping)) {
          if (!sourceCol) continue;
          out[canonical] = r[sourceCol] ?? "";
        }
        return out;
      };

      // Skip the hint row (example/valid values row)
      const isHintRow = (r: any) =>
        (r.day_of_week || "").toLowerCase() === "monday" &&
        (r.start_time || "").substring(0, 5) === "08:00" &&
        (r.end_time || "").substring(0, 5) === "09:00" &&
        (r.default_title || "").toLowerCase().includes("math 101");
      const dataRows = records.map(remapRecord).filter((r) => !isHintRow(r));

      const errors: string[] = [];
      const parsedBlocks: any[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        const rowNum = i + 1;
        const dayStr = (r.day_of_week || "").trim();
        const dayNum = DAY_NAME_TO_NUMBER[dayStr];
        if (dayNum === undefined) {
          errors.push(`Row ${rowNum}: Invalid day_of_week "${dayStr}". Must be a full day name (e.g. Monday).`);
          continue;
        }
        const startTime = normalizeTimeHhMm(r.start_time);
        const endTime = normalizeTimeHhMm(r.end_time);
        if (!startTime) {
          errors.push(`Row ${rowNum}: Invalid start_time "${r.start_time}". Use HH:MM format (e.g. 08:45 or 8:45).`);
          continue;
        }
        if (!endTime) {
          errors.push(`Row ${rowNum}: Invalid end_time "${r.end_time}". Use HH:MM format (e.g. 08:45 or 8:45).`);
          continue;
        }
        if (endTime <= startTime) {
          errors.push(`Row ${rowNum}: end_time must be after start_time.`);
          continue;
        }
        const blockType = (r.block_type || "").trim().toLowerCase();
        if (!BLOCK_TYPES.includes(blockType as (typeof BLOCK_TYPES)[number])) {
          errors.push(`Row ${rowNum}: Invalid block_type "${r.block_type}". Must be anchor, curriculum, or flexible.`);
          continue;
        }
        const defaultTitle = (r.default_title || "").trim();
        if (!defaultTitle) {
          errors.push(`Row ${rowNum}: default_title is required.`);
          continue;
        }
        parsedBlocks.push({
          dayOfWeek: dayNum,
          startTime,
          endTime,
          blockType,
          defaultTitle,
          subjectArea: (r.subject_area || "").trim() || null,
          sortOrder: parseInt(r.sort_order || "0") || 0,
          defaultDescription: null,
        });
      }

      // Check for overlapping blocks within a day
      const dayGroups: Record<number, { startTime: string; endTime: string; row: number }[]> = {};
      parsedBlocks.forEach((b, idx) => {
        if (!dayGroups[b.dayOfWeek]) dayGroups[b.dayOfWeek] = [];
        dayGroups[b.dayOfWeek].push({ startTime: b.startTime, endTime: b.endTime, row: idx + 1 });
      });
      for (const dayBlocks of Object.values(dayGroups)) {
        for (let i = 0; i < dayBlocks.length; i++) {
          for (let j = i + 1; j < dayBlocks.length; j++) {
            const a = dayBlocks[i], b = dayBlocks[j];
            if (a.startTime < b.endTime && b.startTime < a.endTime) {
              errors.push(`Rows ${a.row} and ${b.row}: Overlapping blocks on ${DAY_NUMBER_TO_NAME[parsedBlocks[a.row - 1].dayOfWeek]} (${a.startTime}–${a.endTime} and ${b.startTime}–${b.endTime}).`);
            }
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Validation errors in CSV", errors });
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      await storage.bulkReplaceSkeletonBlocks(id, parsedBlocks, userId);
      res.json({ success: true, imported: parsedBlocks.length });
    } catch (error: any) {
      console.error("Error importing skeleton CSV:", error);
      res.status(500).json({ message: "Failed to import CSV", error: error.message });
    }
  }
);

// ============================================================
// WEEK PLAN BLOCKS - CSV EXPORT & IMPORT
// ============================================================

router.get(
  "/week-plans/:id/blocks/export-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId);
      const weekPlanBlocks = await storage.getWeekPlanBlocksByWeekPlanId(id);

      const header = ["day_of_week", "start_time", "end_time", "block_type", "title", "description", "objectives", "lesson_link", "notes"];
      const hintRow = ["Monday", "08:00", "09:00", "curriculum", "Science Basics – Intro", "Overview of the lesson", "Obj 1; Obj 2", "https://example.com/lesson", "Any extra notes"];

      const rows = skeletonBlocks.map((sb) => {
        const wb = weekPlanBlocks.find((b) => b.skeletonBlockId === sb.id);
        const objectives = Array.isArray(wb?.objectives) ? (wb!.objectives as string[]).join("; ") : "";
        return [
          DAY_NUMBER_TO_NAME[sb.dayOfWeek] || String(sb.dayOfWeek),
          sb.startTime,
          sb.endTime,
          sb.blockType,
          wb?.title || sb.defaultTitle || "",
          wb?.description || "",
          objectives,
          wb?.lessonLink || "",
          wb?.notes || "",
        ];
      });

      const csv = csvStringify([header, hintRow, ...rows]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="week-plan-${id}-blocks.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting week plan CSV:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  }
);

router.post(
  "/week-plans/:id/blocks/import-csv",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid week plan ID" });
      const plan = await storage.getWeekPlanById(id);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      const schoolId = parseInt(req.schoolId);
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });

      if (!req.files || !req.files.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uploadedFile = req.files.file as UploadedFile;
      if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }
      if (isRtfOrBinary(uploadedFile.data)) {
        return res.status(400).json({ message: "File appears to be binary or RTF. Only plain UTF-8 CSV files are supported." });
      }

      const content = uploadedFile.data.toString("utf-8");
      let records: any[];
      try {
        records = csvParse(content, { columns: true, skip_empty_lines: true, trim: true });
      } catch (e: any) {
        return res.status(400).json({ message: `CSV parse error: ${e.message}` });
      }

      if (records.length === 0) return res.status(400).json({ message: "CSV file is empty" });

      // Optional column mapping from FormData: { canonicalField: sourceHeader }
      let columnMapping: Record<string, string> | null = null;
      const rawMapping = req.body?.mapping;
      if (typeof rawMapping === "string" && rawMapping.trim()) {
        try {
          const parsedMapping = JSON.parse(rawMapping);
          if (parsedMapping && typeof parsedMapping === "object" && !Array.isArray(parsedMapping)) {
            columnMapping = parsedMapping as Record<string, string>;
          }
        } catch {
          return res.status(400).json({ message: "Invalid mapping JSON" });
        }
      }

      const remapRecord = (r: any): any => {
        if (!columnMapping) return r;
        const out: Record<string, string> = {};
        for (const [canonical, sourceCol] of Object.entries(columnMapping)) {
          if (!sourceCol) continue;
          out[canonical] = r[sourceCol] ?? "";
        }
        // Preserve unmapped canonical keys so default_title fallback still works
        // when the client mapped title ← default_title (already in out.title).
        return { ...r, ...out };
      };

      // Skip week-plan hint row and skeleton/template example hint row
      const isHintRow = (r: any) => {
        const title = (r.title || r.default_title || "").toLowerCase();
        const lessonLink = r.lesson_link || "";
        if (title.includes("science basics") && lessonLink.includes("example.com")) return true;
        const day = (r.day_of_week || "").toLowerCase();
        const start = String(r.start_time || "").substring(0, 5);
        const end = String(r.end_time || "").substring(0, 5);
        return day === "monday" && start === "08:00" && end === "09:00" && title.includes("math 101");
      };

      const dataRows = records.map(remapRecord).filter((r) => !isHintRow(r));

      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId);
      const slotKey = (dayOfWeek: number, startTime: string) => `${dayOfWeek}|${startTime}`;
      const skeletonBySlot = new Map<string, { id: number }>();
      for (const sb of skeletonBlocks) {
        const normalizedStart = normalizeTimeHhMm(sb.startTime);
        if (!normalizedStart) continue;
        skeletonBySlot.set(slotKey(sb.dayOfWeek, normalizedStart), { id: sb.id });
      }

      const errors: string[] = [];
      const updates: Array<{
        skeletonBlockId: number;
        title: string | null;
        description: string | null;
        objectives: string[];
        lessonLink: string | null;
        notes: string | null;
      }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        const rowNum = i + 1;
        const dayStr = (r.day_of_week || "").trim();
        const dayNum = DAY_NAME_TO_NUMBER[dayStr];
        if (dayNum === undefined) {
          errors.push(`Row ${rowNum}: Invalid day_of_week "${dayStr}". Must be a full day name (e.g. Monday).`);
          continue;
        }
        const startTime = normalizeTimeHhMm(r.start_time);
        if (!startTime) {
          errors.push(`Row ${rowNum}: Invalid start_time "${r.start_time}". Use HH:MM format (e.g. 08:45 or 8:45).`);
          continue;
        }
        const skeleton = skeletonBySlot.get(slotKey(dayNum, startTime));
        if (!skeleton) {
          errors.push(
            `Row ${rowNum}: No weekly template block matches ${dayStr} at ${startTime}. Import only updates existing template slots (or use Weekly Templates CSV import to change the skeleton).`,
          );
          continue;
        }
        // Template CSVs use default_title; week-plan CSVs use title. Accept both.
        const title = (r.title || r.default_title || "").trim() || null;
        const objectives = (r.objectives || "")
          .split(";")
          .map((s: string) => s.trim())
          .filter(Boolean);
        updates.push({
          skeletonBlockId: skeleton.id,
          title,
          description: (r.description || "").trim() || null,
          objectives,
          lessonLink: (r.lesson_link || "").trim() || null,
          notes: (r.notes || "").trim() || null,
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Validation errors in CSV", errors });
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No data rows to import after filtering hint/example rows" });
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      await storage.bulkUpdateWeekPlanBlocks(id, updates, userId);
      res.json({ success: true, updated: updates.length });
    } catch (error: any) {
      console.error("Error importing week plan CSV:", error);
      res.status(500).json({ message: "Failed to import CSV", error: error.message });
    }
  }
);

// ============================================================
// FILE ATTACHMENTS (presigned URL flow)
// ============================================================

router.post(
  "/upload/request-url",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin', 'director']),
  logDirectorAccess,
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
