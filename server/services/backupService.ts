
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';

export class BackupService {
  private backupDir: string;
  private backupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDir = path.join(process.cwd(), 'data', 'backups');
  }

  async init() {
    // Ensure backup directory exists
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('Error creating backup directory:', error);
    }
  }

  async performBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
      // Backup users
      const users = await storage.getAllUsers();
      await this.saveBackup('users', users, timestamp);

      // Backup curricula
      const curricula = await storage.getAllCurricula();
      await this.saveBackup('curricula', curricula, timestamp);

      // Backup knowledge bases
      const knowledgeBases = await storage.getAllKnowledgeBases();
      await this.saveBackup('knowledge-bases', knowledgeBases, timestamp);

      // Backup activities
      const activities = await storage.getAllActivities();
      await this.saveBackup('activities', activities, timestamp);

      console.log(`Backup completed successfully at ${timestamp}`);
    } catch (error) {
      console.error('Backup failed:', error);
    }
  }

  private async saveBackup(type: string, data: any, timestamp: string) {
    const filename = `${type}_${timestamp}.json`;
    const filepath = path.join(this.backupDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  startAutomaticBackups(intervalHours = 24) {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    // Convert hours to milliseconds
    const interval = intervalHours * 60 * 60 * 1000;
    
    this.backupInterval = setInterval(() => {
      this.performBackup();
    }, interval);

    // Perform initial backup
    this.performBackup();
  }

  stopAutomaticBackups() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }
}

export const backupService = new BackupService();
