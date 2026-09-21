import { Router } from "express";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import { scheduleCurriculumAssistant } from "../services/scheduleCurriculumAssistant";
import {
  blockLengthMinutes,
  classBandFromClass,
  isGoogleLessonDoc,
  matchCurriculumAssetsToBlocks,
  proposalFromAsset,
  type CurriculumBand,
} from "@shared/curriculum-drive";
import { parseLessonDocFields } from "@shared/lesson-push";
import { exportDriveFilePlainText } from "../lib/google-drive-curriculum";

const router = Router();
const AI_WRITE_ROLES = ["schoolAdmin", "admin", "superAdmin", "director"];

router.get("/status", supabaseAuth, async (_req, res) => {
  res.json({ available: scheduleCurriculumAssistant.isAvailable() });
});

router.post(
  "/generate-week",
  supabaseAuth,
  requireRole(AI_WRITE_ROLES),
  requireSchoolContext,
  async (req: any, res) => {
    try {
      const { skeletonId, weekNumber, previousWeekSummary, skeletonBlockId } = req.body;
      const schoolId = parseInt(req.schoolId);
      if (!skeletonId || !weekNumber || isNaN(schoolId)) {
        return res.status(400).json({ message: "skeletonId and weekNumber required" });
      }
      const skeleton = await storage.getWeeklySkeletonById(skeletonId);
      if (!skeleton) return res.status(404).json({ message: "Skeleton not found" });
      if (skeleton.schoolId !== schoolId) return res.status(403).json({ message: "Access denied" });
      const blocks = await storage.getSkeletonBlocksBySkeletonId(skeletonId);

      const classId = skeleton.classId ?? null;
      if (!classId) {
        return res.json({
          success: true,
          usedFallback: "build",
          message: "no Drive lessons indexed",
          blocks: [],
        });
      }

      const klass = await storage.getClassById(classId);
      const assets = await storage.getCurriculumAssetsByClassId(classId, schoolId);
      const targetId = skeletonBlockId != null ? Number(skeletonBlockId) : null;
      const matchBlocks =
        targetId != null && Number.isFinite(targetId)
          ? blocks.filter((block) => block.id === targetId)
          : blocks;
      if (targetId != null && matchBlocks.length === 0) {
        return res.status(404).json({ message: "Skeleton block not found on this template" });
      }
      const slotFolderId = targetId != null ? matchBlocks[0]?.driveFolderId || null : null;
      if (targetId != null && !slotFolderId) {
        return res.json({
          success: true,
          usedFallback: "build",
          message: "Connect a Drive folder on this lesson first",
          classId,
          blocks: [],
        });
      }
      const lessonAssets = assets.filter((a) => {
        if ((a.assetKind || "lesson") === "guide") return false;
        if (slotFolderId) return a.driveFolderId === slotFolderId;
        return true;
      });
      if (lessonAssets.length === 0) {
        return res.json({
          success: true,
          usedFallback: "build",
          message: slotFolderId
            ? "no Drive lessons indexed for this lesson folder"
            : "no Drive lessons indexed",
          classId,
          blocks: [],
        });
      }

      const existingPlans = await storage.getWeekPlansBySkeletonId(skeletonId);
      const currentPlan = existingPlans.find((p) => p.weekNumber === Number(weekNumber));
      const usedIds = await storage.getCurriculumAssetIdsUsedInClass(classId, currentPlan?.id);
      const currentBlocks = currentPlan
        ? await storage.getWeekPlanBlocksByWeekPlanId(currentPlan.id)
        : [];
      const pinnedId = targetId != null
        ? currentBlocks.find((b) => b.skeletonBlockId === targetId)?.curriculumAssetId ?? null
        : null;
      const pinned = pinnedId != null ? lessonAssets.find((a) => a.id === pinnedId) : null;

      const classBand: CurriculumBand = classBandFromClass({
        title: klass?.title || skeleton.name || skeleton.gradeLevel,
        gradeLevels: klass?.gradeLevels,
      });

      const matchable = lessonAssets.map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        band: a.band,
        sessionNo: a.sessionNo,
        subject: a.subject,
        assetKind: a.assetKind,
        minutes: a.minutes,
        mimeType: a.mimeType,
        webViewLink: a.webViewLink,
        objectives: a.objectives,
        materials: a.materials,
      }));

      const skip = new Set(usedIds);
      if (pinned && !isGoogleLessonDoc(pinned.mimeType)) skip.add(pinned.id);

      const proposed = targetId != null && pinned && isGoogleLessonDoc(pinned.mimeType)
        ? [proposalFromAsset(
            targetId,
            matchable.find((a) => a.id === pinned.id)!,
            blockLengthMinutes(matchBlocks[0].startTime, matchBlocks[0].endTime),
          )]
        : matchCurriculumAssetsToBlocks({
            blocks: matchBlocks,
            assets: matchable,
            weekNumber: Number(weekNumber),
            classBand,
            usedAssetIdsInTerm: skip,
          });

      const filled = await Promise.all(
        proposed.map(async (row) => {
          const asset = lessonAssets.find((a) => a.id === row.curriculumAssetId);
          if (!asset?.driveFileId) return row;
          try {
            const text = await exportDriveFilePlainText(asset.driveFileId, asset.mimeType);
            if (!text) return row;
            const parsed = parseLessonDocFields(text);
            return {
              ...row,
              title: parsed.title || row.title,
              description: parsed.description || row.description,
              objectives: parsed.objectives.length ? parsed.objectives : row.objectives,
              materials: parsed.materials.length ? parsed.materials : row.materials,
              homework: parsed.homework || row.homework,
              notes: parsed.notes || row.notes,
              lessonLink: row.lessonLink || asset.webViewLink || null,
            };
          } catch {
            return row;
          }
        }),
      );

      res.json({
        success: true,
        usedFallback: null,
        classId,
        classBand,
        weekNumber: Number(weekNumber),
        previousWeekSummary: previousWeekSummary || null,
        blocks: filled,
      });
    } catch (error) {
      console.error("Error generating week plan:", error);
      res.status(500).json({ message: "Failed to generate week plan" });
    }
  }
);

router.post(
  "/suggest-block-content",
  supabaseAuth,
  requireRole(AI_WRITE_ROLES),
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
  requireRole(AI_WRITE_ROLES),
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
  requireRole(AI_WRITE_ROLES),
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
