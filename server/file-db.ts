import fs from 'fs';
import path from 'path';
import { Class, InsertClass } from '@shared/schema';

// Directory for storing data
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File path for classes data
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

// Initialize ID counter
let classIdCounter = 1;

// Load classes from file
function loadClasses(): Class[] {
  if (!fs.existsSync(CLASSES_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(CLASSES_FILE, 'utf-8');
    const classes = JSON.parse(data);
    
    // Update ID counter to be higher than the maximum ID in the file
    if (classes.length > 0) {
      const maxId = Math.max(...classes.map((c: Class) => c.id));
      classIdCounter = maxId + 1;
    }
    
    return classes;
  } catch (error) {
    console.error('Error loading classes data:', error);
    return [];
  }
}

// Save classes to file
function saveClasses(classes: Class[]): void {
  try {
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classes, null, 2));
  } catch (error) {
    console.error('Error saving classes data:', error);
  }
}

// Get all classes with filtering, sorting, and pagination
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
    let classes = loadClasses();
    
    // Apply search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      classes = classes.filter(c => 
        c.title.toLowerCase().includes(searchLower) || 
        (c.description && c.description.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply category filter
    if (options.category) {
      classes = classes.filter(c => c.category === options.category);
    }
    
    // Apply status filter
    if (options.status) {
      classes = classes.filter(c => c.status === options.status);
    }
    
    // Apply sorting
    if (options.sortBy) {
      const sortBy = options.sortBy as keyof Class;
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      
      classes.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (aValue === bValue) return 0;
        if (aValue < bValue) return -1 * sortOrder;
        return 1 * sortOrder;
      });
    } else {
      // Default sorting by created_at DESC
      classes.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    
    // Apply pagination
    if (options.limit) {
      const start = options.page ? (options.page - 1) * options.limit : (options.offset || 0);
      classes = classes.slice(start, start + options.limit);
    }
    
    return classes;
  } catch (error) {
    console.error('Error getting classes:', error);
    return [];
  }
}

// Get classes count with filters
export async function getClassesCount(options: { 
  search?: string;
  category?: string;
  status?: string;
}): Promise<number> {
  try {
    let classes = loadClasses();
    
    // Apply search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      classes = classes.filter(c => 
        c.title.toLowerCase().includes(searchLower) || 
        (c.description && c.description.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply category filter
    if (options.category) {
      classes = classes.filter(c => c.category === options.category);
    }
    
    // Apply status filter
    if (options.status) {
      classes = classes.filter(c => c.status === options.status);
    }
    
    return classes.length;
  } catch (error) {
    console.error('Error getting classes count:', error);
    return 0;
  }
}

// Get class by ID
export async function getClassById(id: number): Promise<Class | undefined> {
  try {
    const classes = loadClasses();
    return classes.find(c => c.id === id);
  } catch (error) {
    console.error('Error getting class by ID:', error);
    return undefined;
  }
}

// Create a new class
export async function createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
  try {
    const classes = loadClasses();
    
    const id = classIdCounter++;
    const now = new Date();
    
    const newClass: Class = {
      ...classData,
      id,
      status: classData.status || 'published',
      enrollmentCount: 0,
      createdAt: now,
      updatedAt: now
    };
    
    classes.push(newClass);
    saveClasses(classes);
    
    return newClass;
  } catch (error) {
    console.error('Error creating class:', error);
    throw error;
  }
}

// Update an existing class
export async function updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
  try {
    const classes = loadClasses();
    const index = classes.findIndex(c => c.id === id);
    
    if (index === -1) {
      return undefined;
    }
    
    const updatedClass = {
      ...classes[index],
      ...classData,
      updatedAt: new Date()
    };
    
    classes[index] = updatedClass;
    saveClasses(classes);
    
    return updatedClass;
  } catch (error) {
    console.error('Error updating class:', error);
    return undefined;
  }
}

// Delete a class
export async function deleteClass(id: number): Promise<boolean> {
  try {
    const classes = loadClasses();
    const filteredClasses = classes.filter(c => c.id !== id);
    
    if (filteredClasses.length === classes.length) {
      return false; // No class was deleted
    }
    
    saveClasses(filteredClasses);
    return true;
  } catch (error) {
    console.error('Error deleting class:', error);
    return false;
  }
}

// Get classes by instructor
export async function getClassesByInstructor(instructorId: number): Promise<Class[]> {
  try {
    const classes = loadClasses();
    return classes.filter(c => c.instructorId === instructorId);
  } catch (error) {
    console.error('Error getting classes by instructor:', error);
    return [];
  }
}

// Increment class enrollment count
export async function incrementClassEnrollment(id: number): Promise<Class | undefined> {
  try {
    const classes = loadClasses();
    const index = classes.findIndex(c => c.id === id);
    
    if (index === -1) {
      return undefined;
    }
    
    const updatedClass = {
      ...classes[index],
      enrollmentCount: (classes[index].enrollmentCount || 0) + 1,
      updatedAt: new Date()
    };
    
    classes[index] = updatedClass;
    saveClasses(classes);
    
    return updatedClass;
  } catch (error) {
    console.error('Error incrementing class enrollment:', error);
    return undefined;
  }
}

// Create classes table - not needed for file storage but included for API compatibility
export async function createClassesTable(): Promise<void> {
  // This is a no-op for file-based storage
  return;
}