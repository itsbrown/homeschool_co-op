import { createClassesTable } from './classes-db';

// Initialize database tables
export async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Create classes table
    await createClassesTable();
    
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}