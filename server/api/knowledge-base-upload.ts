import { Request, Response } from "express";
import fileUpload from 'express-fileupload';
import { knowledgeBaseProcessor } from '../services/knowledgeBaseProcessor';
import { storage } from "../storage";

export interface UploadedFile {
  name: string;
  data: Buffer;
  size: number;
  encoding: string;
  tempFilePath: string;
  truncated: boolean;
  mimetype: string;
  md5: string;
  mv: (path: string) => Promise<void>;
}

/**
 * Upload files to a knowledge base and start AI processing
 */
export const uploadKnowledgeBaseFiles = async (req: Request, res: Response) => {
  try {
    const knowledgeBaseId = parseInt(req.params.id);
    const authData = (req as any).auth;

    if (!authData?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Verify knowledge base exists and user has permission
    const knowledgeBase = await storage.getKnowledgeBase(knowledgeBaseId);
    if (!knowledgeBase) {
      return res.status(404).json({ message: "Knowledge base not found" });
    }

    if (knowledgeBase.authorId !== authData.userId) {
      return res.status(403).json({ message: "Permission denied" });
    }

    // Check if files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Process uploaded files
    const uploadedFiles = [];
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    for (const file of files) {
      if (file && typeof file === 'object' && 'data' in file) {
        const uploadedFile = file as UploadedFile;
        
        // Validate file type and size
        if (uploadedFile.size > 50 * 1024 * 1024) { // 50MB limit
          return res.status(400).json({ 
            message: `File ${uploadedFile.name} is too large (max 50MB)` 
          });
        }

        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'text/plain',
          'text/html',
          'text/markdown'
        ];

        if (!allowedTypes.includes(uploadedFile.mimetype)) {
          return res.status(400).json({ 
            message: `File type ${uploadedFile.mimetype} not supported for ${uploadedFile.name}` 
          });
        }

        uploadedFiles.push({
          buffer: uploadedFile.data,
          originalName: uploadedFile.name,
          mimetype: uploadedFile.mimetype
        });
      }
    }

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: "No valid files found" });
    }

    console.log(`📤 Starting upload processing for ${uploadedFiles.length} files in knowledge base ${knowledgeBaseId}`);

    // Start AI processing
    const jobId = await knowledgeBaseProcessor.processKnowledgeBase(
      knowledgeBaseId,
      uploadedFiles
    );

    res.status(202).json({
      message: "Files uploaded successfully, AI processing started",
      jobId,
      filesCount: uploadedFiles.length,
      status: "processing"
    });

  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ 
      message: "Failed to upload files", 
      error: error instanceof Error ? error.message : "Unknown error"
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

    if (!authData?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const job = knowledgeBaseProcessor.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ message: "Processing job not found" });
    }

    // Verify user has permission to view this job
    const knowledgeBase = await storage.getKnowledgeBase(job.knowledgeBaseId);
    if (!knowledgeBase || knowledgeBase.authorId !== authData.userId) {
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
      results: job.results ? {
        totalWords: job.results.overallAnalysis.totalWords,
        avgReadability: job.results.overallAnalysis.avgReadability,
        suggestedGradeLevel: job.results.overallAnalysis.suggestedGradeLevel,
        primarySubjects: job.results.overallAnalysis.primarySubjects,
        combinedTopics: job.results.overallAnalysis.combinedTopics,
        analyzedFiles: job.results.analyses.map(a => ({
          fileName: a.fileName,
          summary: a.summary,
          keyTopics: a.keyTopics.slice(0, 5),
          difficulty: a.difficulty
        }))
      } : undefined
    });

  } catch (error) {
    console.error("Processing status error:", error);
    res.status(500).json({ 
      message: "Failed to get processing status",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Get AI processing statistics
 */
export const getProcessingStats = async (req: Request, res: Response) => {
  try {
    const authData = (req as any).auth;

    if (!authData?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const stats = knowledgeBaseProcessor.getStats();

    res.json({
      processingStats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Processing stats error:", error);
    res.status(500).json({ 
      message: "Failed to get processing stats",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};