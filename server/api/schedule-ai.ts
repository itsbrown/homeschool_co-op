import { Router } from "express";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireAdmin } from "../middleware/auth0-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import { scheduleCurriculumAssistant } from "../services/scheduleCurriculumAssistant";

const router = Router();

router.get("/status", supabaseAuth, async (_req, res) => {
  res.json({ available: scheduleCurriculumAssistant.isAvailable() });
});

router.post(
  "/generate-week",
  supabaseAuth,
  requireAdmin,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      if (!scheduleCurriculumAssistant.isAvailable()) {
        return res.status(503).json({ message: "AI service is not available" });
      }
      const { skeletonId, weekNumber, previousWeekSummary } = req.body;
      const schoolId = parseInt(req.schoolId);
      if (!skeletonId || !weekNumber || isNaN(schoolId)) {
        return res.status(400).json({ message: "skeletonId and weekNumber required" });
      }
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const blocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);
      const result = await scheduleCurriculumAssistant.generateWeekPlan({
        skeleton,
        blocks,
        weekNumber,
        gradeLevel: skeleton.gradeLevel,
        schoolId,
        previousWeekSummary,
      });
      res.json(result);
    } catch (error) {
      console.error("Error generating week plan:", error);
      res.status(500).json({ message: "Failed to generate week plan" });
    }
  }
);

router.post(
  "/suggest-block-content",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      if (!scheduleCurriculumAssistant.isAvailable()) {
        return res.status(503).json({ message: "AI service is not available" });
      }
      const { skeletonBlockId, previousContent } = req.body;
      const schoolId = parseInt(req.schoolId);
      if (!skeletonBlockId || isNaN(schoolId)) {
        return res.status(400).json({ message: "skeletonBlockId required" });
      }
      const block = await storage.getSkeletonBlockById(skeletonBlockId);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const skeleton = await storage.getWeeklySkeletonById(block.skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const result = await scheduleCurriculumAssistant.suggestBlockContent({
        block,
        gradeLevel: skeleton.gradeLevel,
        subjectArea: block.subjectArea || undefined,
        previousContent,
        schoolId,
      });
      res.json(result);
    } catch (error) {
      console.error("Error suggesting block content:", error);
      res.status(500).json({ message: "Failed to suggest block content" });
    }
  }
);

router.post(
  "/analyze-gaps",
  supabaseAuth,
  requireAdmin,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      if (!scheduleCurriculumAssistant.isAvailable()) {
        return res.status(503).json({ message: "AI service is not available" });
      }
      const { weekPlanId } = req.body;
      const schoolId = parseInt(req.schoolId);
      if (!weekPlanId || isNaN(schoolId)) {
        return res.status(400).json({ message: "weekPlanId required" });
      }
      const weekPlan = await storage.getWeekPlanById(weekPlanId);
      if (!weekPlan) return res.status(404).json({ message: "Week plan not found" });
      if (weekPlan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const blocks = await storage.getWeekPlanBlocksByWeekPlanId(weekPlanId);
      const skeleton = await storage.getWeeklySkeletonById(weekPlan.skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(skeleton.id);
      const result = await scheduleCurriculumAssistant.analyzeScheduleGaps({
        weekPlan,
        blocks,
        skeletonBlocks,
        gradeLevel: skeleton.gradeLevel,
      });
      res.json(result);
    } catch (error) {
      console.error("Error analyzing schedule gaps:", error);
      res.status(500).json({ message: "Failed to analyze schedule gaps" });
    }
  }
);

router.post(
  "/recommend-resources",
  supabaseAuth,
  requireSchoolContext,
  async (req: any, res) => {
    try {
      if (!scheduleCurriculumAssistant.isAvailable()) {
        return res.status(503).json({ message: "AI service is not available" });
      }
      const { weekPlanBlockId } = req.body;
      const schoolId = parseInt(req.schoolId);
      if (!weekPlanBlockId || isNaN(schoolId)) {
        return res.status(400).json({ message: "weekPlanBlockId required" });
      }
      const block = await storage.getWeekPlanBlockById(weekPlanBlockId);
      if (!block) return res.status(404).json({ message: "Block not found" });
      const plan = await storage.getWeekPlanById(block.weekPlanId);
      if (!plan) return res.status(404).json({ message: "Week plan not found" });
      if (plan.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const skeletonBlock = await storage.getSkeletonBlockById(block.skeletonBlockId);
      if (!skeletonBlock) return res.status(404).json({ message: "Skeleton block not found" });
      const skeleton = await storage.getWeeklySkeletonById(skeletonBlock.skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      const result = await scheduleCurriculumAssistant.recommendResources({
        block,
        skeletonBlock,
        gradeLevel: skeleton.gradeLevel,
        schoolId,
      });
      res.json(result);
    } catch (error) {
      console.error("Error recommending resources:", error);
      res.status(500).json({ message: "Failed to recommend resources" });
    }
  }
);

export default router;
