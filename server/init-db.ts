import { createClassesTable } from './classes-db';
import fs from 'fs';
import path from 'path';

// Initialize database tables
export async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Ensure data directory exists for file-based storage
    // Ensure all required data directories exist
    const dirs = [
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'data/users'),
      path.join(process.cwd(), 'data/knowledge-bases'),
      path.join(process.cwd(), 'data/activities'),
      path.join(process.cwd(), 'data/programs')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
    
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