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

const router = Router();

// ============================================================
// WEEKLY SKELETONS
// ============================================================

router.get(
  "/skeletons",
  supabaseAuth,
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  "/week-plans/:id",
  supabaseAuth,
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
  requireRole(['schoolAdmin', 'admin', 'superAdmin']),
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
