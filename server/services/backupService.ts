
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
      // Backup all data files directly from the data directory
      await this.backupDataFiles(timestamp);

      console.log(`✅ Backup completed successfully at ${timestamp}`);
    } catch (error) {
      console.error('❌ Backup failed:', error);
    }
  }

  private async backupDataFiles(timestamp: string) {
    const dataDir = path.join(process.cwd(), 'data');
    const filesToBackup = [
      'children.json',
      'classes.json', 
      'staff.json',
      'schools.json',
      'knowledge-bases.json',
      'curricula.json',
      'lessons.json',
      'activities.json',
      'users.json'
    ];

    for (const filename of filesToBackup) {
      try {
        const filePath = path.join(dataDir, filename);
        const data = await fs.readFile(filePath, 'utf8');
        
        // Parse and re-stringify to ensure valid JSON
        const parsedData = JSON.parse(data);
        await this.saveBackup(filename.replace('.json', ''), parsedData, timestamp);
        
        console.log(`📁 Backed up: ${filename}`);
      } catch (error) {
        // File might not exist, which is okay
        console.log(`⚠️  Skipped ${filename}: ${error.message}`);
      }
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

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(file => file.endsWith('.json'));
      
      // Group backups by timestamp
      const backupGroups = new Map();
      
      backupFiles.forEach(file => {
        const parts = file.split('_');
        if (parts.length >= 2) {
          const timestamp = parts.slice(1).join('_').replace('.json', '');
          if (!backupGroups.has(timestamp)) {
            backupGroups.set(timestamp, []);
          }
          backupGroups.get(timestamp).push({
            type: parts[0],
            filename: file,
            path: path.join(this.backupDir, file)
          });
        }
      });
      
      return Array.from(backupGroups.entries()).map(([timestamp, files]) => ({
        timestamp,
        date: new Date(timestamp.replace(/-/g, ':')),
        files: files.length,
        types: files.map(f => f.type)
      })).sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      console.error('Error listing backups:', error);
      return [];
    }
  }

  async restoreBackup(timestamp: string) {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(file => file.includes(timestamp));
      
      if (backupFiles.length === 0) {
        throw new Error(`No backup found for timestamp: ${timestamp}`);
      }

      const dataDir = path.join(process.cwd(), 'data');
      let restoredCount = 0;

      for (const file of backupFiles) {
        const backupPath = path.join(this.backupDir, file);
        const type = file.split('_')[0];
        const targetPath = path.join(dataDir, `${type}.json`);
        
        try {
          const backupData = await fs.readFile(backupPath, 'utf8');
          await fs.writeFile(targetPath, backupData);
          console.log(`📁 Restored: ${type}.json`);
          restoredCount++;
        } catch (error) {
          console.error(`❌ Failed to restore ${type}:`, error);
        }
      }

      console.log(`✅ Backup restore completed: ${restoredCount} files restored`);
      return { success: true, restoredCount };
    } catch (error) {
      console.error('❌ Backup restore failed:', error);
      return { success: false, error: error.message };
    }
  }
}

export const backupService = new BackupService();
