import { EventEmitter } from 'events';
import { storage } from '../storage';
import { generateEducationalActivity } from './openai';
import fs from 'fs/promises';
import path from 'path';

// Interface for activity generation parameters
interface ActivityGenerationParams {
  subject: string;
  ageRange: string;
  activityType: string;
  difficulty: string;
  instructions: string;
  knowledgeBaseIds: number[];
  userId: number;
  jobId: string;
}

// Interface for job result
interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  activity?: any; // Support for direct access to activity object
  id?: number;    // Support for direct access to ID
}

// Type definition for job types
type JobType = 'activity_generation' | 'general_task';

// Class for managing background tasks
class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, { status: string, result?: JobResult }>;
  private runningTasks: number;
  private maxConcurrentTasks: number;
  private taskQueue: Array<() => Promise<void>>;

  constructor(maxConcurrent = 3) {
    super();
    this.tasks = new Map();
    this.runningTasks = 0;
    this.maxConcurrentTasks = maxConcurrent;
    this.taskQueue = [];
  }
  
  // Create and queue a generic job
  createJob(jobId: string, jobType: JobType, task: () => Promise<any>): string {
    this.tasks.set(jobId, { status: 'queued' });
    
    const taskWrapper = async () => {
      try {
        this.tasks.set(jobId, { status: 'in_progress' });
        
        // Execute the task
        const result = await task();
        
        // Update task status with success result
        this.tasks.set(jobId, { 
          status: 'completed', 
          result: {
            success: true,
            data: result
          } 
        });
        
        this.emit('task-completed', jobId, result);
      } catch (error) {
        console.error(`Error executing ${jobType} job ${jobId}:`, error instanceof Error ? error.message : String(error));
        
        // Update task status with error
        this.tasks.set(jobId, { 
          status: 'failed', 
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          } 
        });
        
        this.emit('task-failed', jobId);
      } finally {
        this.runningTasks--;
        this.processQueue(); // Process next task in queue
      }
    };
    
    this.taskQueue.push(taskWrapper);
    this.processQueue();
    
    return jobId;
  }

  // Create a unique job ID
  private createJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Queue an activity generation job
  queueActivityGeneration(params: Omit<ActivityGenerationParams, 'jobId'>): string {
    const jobId = this.createJobId();
    this.tasks.set(jobId, { status: 'queued' });
    
    const task = async () => {
      try {
        this.tasks.set(jobId, { status: 'running' });
        
        // Fetch knowledge base content
        const knowledgeBaseContent = await this.getKnowledgeBaseContent(params.knowledgeBaseIds, params.userId);
        
        // Generate activity
        const generatedActivity = await generateEducationalActivity(
          params.subject,
          params.ageRange,
          params.activityType,
          params.difficulty,
          params.instructions,
          knowledgeBaseContent
        );
        
        // Create directories if they don't exist
        const uploadsDir = path.join(process.cwd(), "uploads");
        const activitiesDir = path.join(uploadsDir, "activities");
        
        try {
          await fs.mkdir(uploadsDir, { recursive: true });
          await fs.mkdir(activitiesDir, { recursive: true });
        } catch (error) {
          console.error("Error creating directories:", error);
        }
        
        // Save the generated activity to file
        const timestamp = new Date().getTime();
        const filename = `${params.activityType}_${params.subject.replace(/\s+/g, '_')}_${timestamp}.json`;
        const filePath = path.join(activitiesDir, filename);
        
        await fs.writeFile(filePath, JSON.stringify(generatedActivity, null, 2));
        
        // Save to database
        const activity = await storage.createActivity({
          title: generatedActivity.title,
          type: params.activityType as any,
          subject: params.subject,
          difficulty: params.difficulty as any,
          ageRange: params.ageRange,
          content: generatedActivity,
          url: `/uploads/activities/${filename}`,
          authorId: params.userId,
          isPublic: false,
        });
        
        // Update task status with success result
        const result: JobResult = {
          success: true,
          data: {
            activity,
            activityContent: generatedActivity,
            filePath: `/uploads/activities/${filename}`
          }
        };
        
        this.tasks.set(jobId, { status: 'completed', result });
        this.emit('task-completed', jobId, result);
      } catch (error) {
        console.error(`Error executing task ${jobId}:`, error);
        
        // Update task status with error
        const result: JobResult = {
          success: false,
          error: error.message || 'Unknown error occurred'
        };
        
        this.tasks.set(jobId, { status: 'failed', result });
        this.emit('task-failed', jobId, result);
      } finally {
        this.runningTasks--;
        this.processQueue(); // Process next task in queue
      }
    };
    
    this.taskQueue.push(task);
    this.processQueue();
    
    return jobId;
  }
  
  // Process the task queue
  private processQueue() {
    if (this.runningTasks < this.maxConcurrentTasks && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        this.runningTasks++;
        task().catch(error => {
          console.error('Error executing background task:', error);
          this.runningTasks--;
          this.processQueue();
        });
      }
    }
  }
  
  // Get knowledge base content
  private async getKnowledgeBaseContent(knowledgeBaseIds: number[], userId: number): Promise<string> {
    if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
      return "";
    }

    try {
      const contentChunks = await Promise.all(
        knowledgeBaseIds.map(async (id) => {
          const kb = await storage.getKnowledgeBase(id);
          if (kb) {
            return `KNOWLEDGE BASE: ${kb.title}\nSUBJECT: ${kb.subject}\n\nCONTENT:\n${JSON.stringify(kb.metadata || {})}\n\n`;
          }
          return "";
        })
      );

      return contentChunks.join("\n");
    } catch (error) {
      console.error("Error fetching knowledge base content:", error);
      return "";
    }
  }
  
  // Get job status
  getJobStatus(jobId: string): { status: string, result?: JobResult } | undefined {
    return this.tasks.get(jobId);
  }
  
  // Clean up old completed jobs (can be called periodically)
  cleanupCompletedJobs(olderThanHours = 24) {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    for (const [jobId, jobInfo] of this.tasks.entries()) {
      if ((jobInfo.status === 'completed' || jobInfo.status === 'failed') && 
          jobId.includes(`job_${cutoffTime}`)) {
        this.tasks.delete(jobId);
      }
    }
  }
}

// Create a singleton instance
const backgroundTaskManager = new BackgroundTaskManager();

export default backgroundTaskManager;