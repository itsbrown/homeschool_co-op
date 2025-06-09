import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { processFiles, ExtractedContent } from './fileProcessor';
import { processExtractedContent, ContentAnalysis, ContentEmbedding } from './aiContentAnalyzer';
import { storage } from '../storage';

export interface ProcessingJob {
  id: string;
  knowledgeBaseId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startTime: Date;
  endTime?: Date;
  files: {
    path: string;
    name: string;
    originalName: string;
  }[];
  results?: {
    extractedContent: ExtractedContent[];
    analyses: (ContentAnalysis & { fileName: string })[];
    embeddings: (ContentEmbedding & { fileName: string })[];
    overallAnalysis: {
      combinedTopics: string[];
      suggestedGradeLevel: string;
      primarySubjects: string[];
      totalWords: number;
      avgReadability: number;
    };
  };
  error?: string;
}

class KnowledgeBaseProcessor {
  private jobs = new Map<string, ProcessingJob>();
  private readonly uploadsDir = path.join(process.cwd(), 'uploads', 'knowledge-bases');

  constructor() {
    // Ensure uploads directory exists
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * Start processing uploaded files for a knowledge base
   */
  async processKnowledgeBase(
    knowledgeBaseId: number,
    files: Array<{ buffer: Buffer; originalName: string; mimetype: string }>
  ): Promise<string> {
    const jobId = uuidv4();
    
    // Create job directory
    const jobDir = path.join(this.uploadsDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Save uploaded files
    const savedFiles = [];
    for (const file of files) {
      const fileName = `${Date.now()}_${file.originalName}`;
      const filePath = path.join(jobDir, fileName);
      
      fs.writeFileSync(filePath, file.buffer);
      savedFiles.push({
        path: filePath,
        name: fileName,
        originalName: file.originalName
      });
    }

    // Create processing job
    const job: ProcessingJob = {
      id: jobId,
      knowledgeBaseId,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      files: savedFiles
    };

    this.jobs.set(jobId, job);

    // Start processing in background
    this.processJobAsync(jobId);

    return jobId;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Process job asynchronously
   */
  private async processJobAsync(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'processing';
      job.progress = 10;

      console.log(`🔄 Starting AI processing for knowledge base ${job.knowledgeBaseId}`);

      // Step 1: Extract content from files
      job.progress = 20;
      const { successful: extractedContent, failed } = await processFiles(job.files);
      
      if (failed.length > 0) {
        console.warn(`⚠️ Failed to process ${failed.length} files:`, failed);
      }

      if (extractedContent.length === 0) {
        throw new Error('No content could be extracted from uploaded files');
      }

      job.progress = 40;

      // Step 2: AI analysis and embedding generation
      console.log(`🧠 Analyzing ${extractedContent.length} files with AI`);
      const { analyses, embeddings, overallAnalysis } = await processExtractedContent(extractedContent);

      job.progress = 80;

      // Step 3: Update knowledge base with AI insights
      await this.updateKnowledgeBaseWithAIInsights(job.knowledgeBaseId, {
        extractedContent,
        analyses,
        embeddings,
        overallAnalysis
      });

      job.progress = 100;
      job.status = 'completed';
      job.endTime = new Date();
      job.results = {
        extractedContent,
        analyses,
        embeddings,
        overallAnalysis
      };

      console.log(`✅ AI processing completed for knowledge base ${job.knowledgeBaseId}`);

    } catch (error) {
      console.error(`❌ AI processing failed for job ${jobId}:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown processing error';
      job.endTime = new Date();
    }
  }

  /**
   * Update knowledge base with AI-generated insights
   */
  private async updateKnowledgeBaseWithAIInsights(
    knowledgeBaseId: number,
    results: ProcessingJob['results']
  ): Promise<void> {
    if (!results) return;

    const { overallAnalysis, analyses } = results;

    // Update knowledge base metadata with AI insights
    const updates = {
      aiProcessed: true,
      aiInsights: {
        totalWords: overallAnalysis.totalWords,
        avgReadability: overallAnalysis.avgReadability,
        suggestedGradeLevel: overallAnalysis.suggestedGradeLevel,
        primarySubjects: overallAnalysis.primarySubjects,
        combinedTopics: overallAnalysis.combinedTopics,
        fileAnalyses: analyses.map(analysis => ({
          fileName: analysis.fileName,
          summary: analysis.summary,
          keyTopics: analysis.keyTopics,
          concepts: analysis.concepts,
          difficulty: analysis.difficulty,
          readabilityScore: analysis.readabilityScore
        }))
      },
      processedAt: new Date()
    };

    try {
      await storage.updateKnowledgeBase(knowledgeBaseId, updates);
      console.log(`📊 Updated knowledge base ${knowledgeBaseId} with AI insights`);
    } catch (error) {
      console.error(`Failed to update knowledge base ${knowledgeBaseId}:`, error);
    }
  }

  /**
   * Clean up old processing jobs and files
   */
  cleanupOldJobs(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    for (const [jobId, job] of Array.from(this.jobs.entries())) {
      if (job.startTime < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
        // Delete job files
        const jobDir = path.join(this.uploadsDir, jobId);
        if (fs.existsSync(jobDir)) {
          fs.rmSync(jobDir, { recursive: true, force: true });
        }

        // Remove job from memory
        this.jobs.delete(jobId);
        console.log(`🧹 Cleaned up old processing job ${jobId}`);
      }
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.status === 'processing' || j.status === 'pending').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length
    };
  }
}

// Create singleton instance
export const knowledgeBaseProcessor = new KnowledgeBaseProcessor();

// Schedule cleanup every hour
setInterval(() => {
  knowledgeBaseProcessor.cleanupOldJobs();
}, 60 * 60 * 1000);