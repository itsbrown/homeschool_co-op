import { EventEmitter } from 'events';

export interface BackgroundJob {
  id: string;
  type: 'activity_generation' | 'knowledge_base_processing' | 'file_analysis';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  data: any;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  userId?: number;
  metadata?: {
    subject?: string;
    activityType?: string;
    title?: string;
  };
}

class BackgroundTaskManager extends EventEmitter {
  private jobs: Map<string, BackgroundJob> = new Map();
  private queue: string[] = [];
  private isProcessing = false;

  createJob(
    type: BackgroundJob['type'], 
    data: any, 
    userId?: number,
    metadata?: BackgroundJob['metadata']
  ): BackgroundJob {
    const job: BackgroundJob = {
      id: `${type}_${Date.now()}`,
      type,
      status: 'queued',
      progress: 0,
      data,
      createdAt: new Date(),
      userId,
      metadata,
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    
    // Emit job created event
    this.emit('job:created', job);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return job;
  }

  getJob(id: string): BackgroundJob | undefined {
    return this.jobs.get(id);
  }

  getJobResult(id: string): any {
    const job = this.jobs.get(id);
    return job?.result;
  }

  getJobStatus(id: string): string | undefined {
    const job = this.jobs.get(id);
    return job?.status;
  }

  updateJob(id: string, updates: Partial<BackgroundJob>): void {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(id, job);
      
      // Emit job updated event
      this.emit('job:updated', job);
      
      // Emit specific status events
      if (updates.status) {
        this.emit(`job:${updates.status}`, job);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);

      if (!job || job.status !== 'queued') {
        continue;
      }

      try {
        // Update job status to running
        this.updateJob(jobId, {
          status: 'running',
          startedAt: new Date(),
          progress: 10,
        });

        // Process the job based on type
        let result;
        switch (job.type) {
          case 'activity_generation':
            result = await this.processActivityGeneration(job);
            break;
          case 'knowledge_base_processing':
            result = await this.processKnowledgeBase(job);
            break;
          case 'file_analysis':
            result = await this.processFileAnalysis(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.type}`);
        }

        // Update job as completed
        this.updateJob(jobId, {
          status: 'completed',
          progress: 100,
          result,
          completedAt: new Date(),
        });

      } catch (error) {
        console.error(`Background job ${jobId} failed:`, error);
        
        // Update job as failed
        this.updateJob(jobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        });
      }
    }

    this.isProcessing = false;
  }

  private async processActivityGeneration(job: BackgroundJob): Promise<any> {
    // Import the actual generation function to avoid circular dependencies
    const { generateEducationalActivity } = await import('../services/openai');
    
    // Update progress
    this.updateJob(job.id, { progress: 30 });
    
    // Generate the activity using the core service
    const result = await generateEducationalActivity(job.data);
    
    // Update progress
    this.updateJob(job.id, { progress: 80 });
    
    return result;
  }

  private async processKnowledgeBase(job: BackgroundJob): Promise<any> {
    // Placeholder for knowledge base processing
    this.updateJob(job.id, { progress: 50 });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return { success: true, message: 'Knowledge base processed' };
  }

  private async processFileAnalysis(job: BackgroundJob): Promise<any> {
    // Placeholder for file analysis
    this.updateJob(job.id, { progress: 50 });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return { success: true, message: 'File analyzed' };
  }

  // Get all jobs for a user
  getUserJobs(userId: number): BackgroundJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Get recent jobs (last 24 hours)
  getRecentJobs(userId?: number): BackgroundJob[] {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return Array.from(this.jobs.values())
      .filter(job => {
        const matchesUser = userId ? job.userId === userId : true;
        const isRecent = job.createdAt > oneDayAgo;
        return matchesUser && isRecent;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Clean up old jobs (older than 7 days)
  cleanup(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < oneWeekAgo && job.status !== 'running') {
        this.jobs.delete(id);
      }
    }
  }
}

// Singleton instance
export const backgroundTaskManager = new BackgroundTaskManager();

// Clean up old jobs every hour
setInterval(() => {
  backgroundTaskManager.cleanup();
}, 60 * 60 * 1000);