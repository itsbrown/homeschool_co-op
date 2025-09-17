import { Pool } from 'pg';
import { Class, InsertClass } from '../shared/schema';

/**
 * Database functions for managing classes
 */
// Create a proper database pool using the correct DATABASE_URL
let pool: Pool;

// Construct connection string from individual PG variables if DATABASE_URL is invalid
let connectionString = process.env.DATABASE_URL;

// Check if we have individual PG variables and DATABASE_URL looks like old Supabase
if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && 
    (!connectionString || connectionString.includes('supabase.co'))) {
  connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`;
  console.log('Classes DB: Using constructed DATABASE_URL from PG variables');
}

if (connectionString) {
  pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Classes DB: Using PostgreSQL database');
} else {
  console.log('Classes DB: No database connection string available');
}

export async function getClassById(id: number): Promise<Class | undefined> {
  try {
    if (!pool) {
      console.log('Database pool not available for getClassById');
      return undefined;
    }
    const result = await pool.query(
      'SELECT * FROM classes WHERE id = $1',
      [id]
    );
    
    return result.rows[0] || undefined;
  } catch (error) {
    console.error('Error getting class by ID:', error);
    return undefined;
  }
}

export async function getClasses(options: { 
  limit?: number; 
  offset?: number;
  page?: number;
  search?: string;
  category?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<Class[]> {
  try {
    let query = 'SELECT * FROM classes';
    const queryParams: any[] = [];
    const conditions: string[] = [];
    
    // Add search condition
    if (options.search) {
      queryParams.push(`%${options.search}%`);
      queryParams.push(`%${options.search}%`);
      conditions.push(`(title ILIKE $${queryParams.length - 1} OR description ILIKE $${queryParams.length})`);
    }
    
    // Add category condition
    if (options.category) {
      queryParams.push(options.category);
      conditions.push(`category = $${queryParams.length}`);
    // Add status filter
    if (options.status) {
      queryParams.push(options.status);
      conditions.push(`status = $${queryParams.length}`);
    }
    }
    
    // Add WHERE clause if we have conditions
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Add ORDER BY clause
    let orderBy = 'created_at DESC';
    if (options.sortBy) {
      // Convert camelCase to snake_case for SQL
      const sqlColumnName = options.sortBy.replace(/([A-Z])/g, '_$1').toLowerCase();
      orderBy = `${sqlColumnName} ${options.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    }
    query += ` ORDER BY ${orderBy}`;
    
    // Add pagination
    if (options.limit) {
      queryParams.push(options.limit);
      query += ` LIMIT $${queryParams.length}`;
      
      // Support for page-based pagination
      if (options.page) {
        const offset = (options.page - 1) * options.limit;
        queryParams.push(offset);
        query += ` OFFSET $${queryParams.length}`;
      }
      // Direct offset if provided
      else if (options.offset) {
        queryParams.push(options.offset);
        query += ` OFFSET $${queryParams.length}`;
      }
    }
    
    const result = await pool.query(query, queryParams);
    
    // Convert from snake_case to camelCase for JavaScript
    return result.rows.map((row) => {
      const camelCaseRow: any = {};
      Object.keys(row).forEach((key) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        camelCaseRow[camelKey] = row[key];
      });
      return camelCaseRow as Class;
    });
  } catch (error) {
    console.error('Error getting classes:', error);
    return [];
  }
}

export async function getClassesCount(options: { 
  search?: string;
  category?: string;
  status?: string;
}): Promise<number> {
  try {
    let query = 'SELECT COUNT(*) FROM classes';
    const queryParams: any[] = [];
    const conditions: string[] = [];
    
    // Add search condition
    if (options.search) {
      queryParams.push(`%${options.search}%`);
      queryParams.push(`%${options.search}%`);
      conditions.push(`(title ILIKE $${queryParams.length - 1} OR description ILIKE $${queryParams.length})`);
    }
    // Add status filter
    if (options.status) {
      queryParams.push(options.status);
      conditions.push(`status = $${queryParams.length}`);
    }
    
    // Add category condition
    if (options.category) {
      queryParams.push(options.category);
      conditions.push(`category = $${queryParams.length}`);
    }
    
    // Add WHERE clause if we have conditions
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    const result = await pool.query(query, queryParams);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting classes count:', error);
    return 0;
  }
}

export async function createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
  try {
    // Convert camelCase to snake_case for SQL
    const snakeCaseData: any = {};
    Object.keys(classData).forEach((key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      snakeCaseData[snakeKey] = classData[key as keyof typeof classData];
    });
    
    // Get all fields from the data object
    const fields = Object.keys(snakeCaseData);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const values = fields.map(field => snakeCaseData[field]);
    
    // Add timestamps
    fields.push('created_at', 'updated_at');
    values.push(new Date(), new Date());
    
    const query = `
      INSERT INTO classes (${fields.join(', ')})
      VALUES (${placeholders}, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    // Convert from snake_case to camelCase for JavaScript
    const createdClass: any = {};
    Object.keys(result.rows[0]).forEach((key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      createdClass[camelKey] = result.rows[0][key];
    });
    
    return createdClass as Class;
  } catch (error) {
    console.error('Error creating class:', error);
    throw new Error('Failed to create class: ' + (error as Error).message);
  }
}

export async function updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
  try {
    // Convert camelCase to snake_case for SQL
    const snakeCaseData: any = {};
    Object.keys(classData).forEach((key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      snakeCaseData[snakeKey] = classData[key as keyof typeof classData];
    });
    
    // Add updated_at timestamp
    snakeCaseData.updated_at = new Date();
    
    // Build SET clause
    const fields = Object.keys(snakeCaseData);
    const setClauses = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = fields.map(field => snakeCaseData[field]);
    
    // Add id to values array for WHERE clause
    values.push(id);
    
    const query = `
      UPDATE classes
      SET ${setClauses}
      WHERE id = $${values.length}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return undefined;
    }
    
    // Convert from snake_case to camelCase for JavaScript
    const updatedClass: any = {};
    Object.keys(result.rows[0]).forEach((key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      updatedClass[camelKey] = result.rows[0][key];
    });
    
    return updatedClass as Class;
  } catch (error) {
    console.error('Error updating class:', error);
    return undefined;
  }
}

export async function deleteClass(id: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'DELETE FROM classes WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting class:', error);
    return false;
  }
}

export async function getClassesByInstructor(instructorId: number): Promise<Class[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM classes WHERE instructor_id = $1 ORDER BY created_at DESC',
      [instructorId]
    );
    
    // Convert from snake_case to camelCase for JavaScript
    return result.rows.map((row) => {
      const camelCaseRow: any = {};
      Object.keys(row).forEach((key) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        camelCaseRow[camelKey] = row[key];
      });
      return camelCaseRow as Class;
    });
  } catch (error) {
    console.error('Error getting classes by instructor:', error);
    return [];
  }
}

export async function incrementClassEnrollment(id: number): Promise<Class | undefined> {
  try {
    const result = await pool.query(
      'UPDATE classes SET enrollment_count = enrollment_count + 1, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return undefined;
    }
    
    // Convert from snake_case to camelCase for JavaScript
    const updatedClass: any = {};
    Object.keys(result.rows[0]).forEach((key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      updatedClass[camelKey] = result.rows[0][key];
    });
    
    return updatedClass as Class;
  } catch (error) {
    console.error('Error incrementing class enrollment:', error);
    return undefined;
  }
}

// Function to create the classes table if it doesn't exist
export async function createClassesTable(): Promise<void> {
  try {
    // Check if pool is available and has query method
    if (!pool || typeof pool.query !== 'function') {
      console.log('Database pool not available, skipping table creation');
      return;
    }
    
    const query = `
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        category_name VARCHAR(100),
        price INTEGER NOT NULL,
        capacity INTEGER DEFAULT 20,
        location VARCHAR(255),
        instructor_id INTEGER NOT NULL,
        instructor_name VARCHAR(255),
        is_published BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'published',
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        enrollment_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await pool.query(query);
    console.log('Classes table created or already exists');
  } catch (error) {
    console.error('Error creating classes table:', error);
    // Don't throw the error here to allow falling back to file-based storage
    // Instead, indicate that we should use file-based storage
    console.log('Will use file-based storage for classes');
  }
}