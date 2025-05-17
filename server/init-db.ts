import { createClassesTable } from './classes-db';
import fs from 'fs';
import path from 'path';

// Initialize database tables
export async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Ensure data directory exists for file-based storage
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('Created data directory for file-based storage');
    }
    
    try {
      // Try to create classes table in database
      await createClassesTable();
    } catch (dbError) {
      console.log('Using file-based storage for classes instead of database');
      // Already falling back to file-based storage, handled in class-storage.ts
    }
    
    console.log('Database/storage initialization complete.');
  } catch (error) {
    console.error('Error during initialization:', error);
    console.log('Continuing with file-based storage as fallback');
  }
}