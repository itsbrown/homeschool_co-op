import { Request, Response } from "express";
import { z } from "zod";
import { knowledgeBaseProcessor } from "../services/knowledgeBaseProcessor";
import { fileUploadService } from "../services/fileUploadService";
import { storage } from "../storage";

const registerKbFilesSchema = z.object({
  files: z
    .array(
      z.object({
        objectPath: z.string().min(1),
        originalName: z.string().min(1),
        mimetype: z.string().min(1),
      }),
    )
    .min(1),
});

/**
 * Start AI processing for knowledge-base files already uploaded via presigned flow.
 */
export const uploadKnowledgeBaseFiles = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id, 10);
    const authData = (req as any).auth;

    if (!authData?.dbUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const parsed = registerKbFilesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0]?.message || "Invalid request body",
      });
    }

    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    if (knowledgeBase.authorId !== authData.dbUserId) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const uploadedFiles: Array<{ buffer: Buffer; originalName: string; mimetype: string }> = [];

    for (const file of parsed.data.files) {
      if (!file.objectPath.startsWith("/objects/knowledge-base/")) {
        return res.status(400).json({
          message: `Invalid objectPath for ${file.originalName}: must start with /objects/knowledge-base/`,
        });
      }

      const config = fileUploadService.getCategoryConfig("knowledgeBase");
      if (config && !config.allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          message: `File type ${file.mimetype} not supported for ${file.originalName}`,
        });
      }

      const buffer = await fileUploadService.readObjectBuffer(file.objectPath);
      if (buffer.length > (config?.maxSizeBytes ?? 50 * 1024 * 1024)) {
        return res.status(400).json({
          message: `File ${file.originalName} is too large (max ${config?.maxSizeBytes ?? 50 * 1024 * 1024} bytes)`,
        });
      }

      uploadedFiles.push({
        buffer,
        originalName: file.originalName,
        mimetype: file.mimetype,
      });
    }

    console.log(
      `📤 Starting upload processing for ${uploadedFiles.length} presigned files in knowledge base ${knowledgeBaseId}`,
    );

    const jobId = await knowledgeBaseProcessor.processKnowledgeBase(
      knowledgeBaseId,
      uploadedFiles,
    );

    res.status(202).json({
      message: "Files uploaded successfully, AI processing started",
      jobId,
      filesCount: uploadedFiles.length,
      status: "processing",
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({
      message: "Failed to upload files",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get processing status for uploaded files
 */
export const getProcessingStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const authData = (req as any).auth;

    if (!authData?.dbUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const job = knowledgeBaseProcessor.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ message: "Processing job not found" });
    }

    const knowledgeBase = await storage.getKnowledgeBase(job.knowledgeBaseId);
    if (!knowledgeBase || knowledgeBase.authorId !== authData.dbUserId) {
      return res.status(403).json({ message: "Permission denied" });
    }

    res.json({
      jobId,
      status: job.status,
      progress: job.progress,
      startTime: job.startTime,
      endTime: job.endTime,
      filesCount: job.files.length,
      error: job.error,
      results: job.results
        ? {
            totalWords: job.results.overallAnalysis.totalWords,
            avgReadability: job.results.overallAnalysis.avgReadability,
            suggestedGradeLevel: job.results.overallAnalysis.suggestedGradeLevel,
            primarySubjects: job.results.overallAnalysis.primarySubjects,
            combinedTopics: job.results.overallAnalysis.combinedTopics,
            analyzedFiles: job.results.analyses.map((a) => ({
              fileName: a.fileName,
              summary: a.summary,
              keyTopics: a.keyTopics.slice(0, 5),
              difficulty: a.difficulty,
            })),
          }
        : undefined,
    });
  } catch (error) {
    console.error("Processing status error:", error);
    res.status(500).json({
      message: "Failed to get processing status",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get AI processing statistics
 */
export const getProcessingStats = async (req: Request, res: Response) => {
  try {
    const authData = (req as any).auth;

    if (!authData?.dbUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const stats = knowledgeBaseProcessor.getStats();

    res.json({
      processingStats: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Processing stats error:", error);
    res.status(500).json({
      message: "Failed to get processing stats",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
