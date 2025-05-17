import fs from 'fs';
import path from 'path';
import { Class, InsertClass } from '@shared/schema';

// Directory for storing data
const DATA_DIR = path.join(process.cwd(), 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize with empty classes if file doesn't exist
if (!fs.existsSync(CLASSES_FILE)) {
  fs.writeFileSync(CLASSES_FILE, JSON.stringify([], null, 2));
}

// ID counter for classes
let classIdCounter = 1;

// Load classes from file
function loadClasses(): Class[] {
  try {
    const data = fs.readFileSync(CLASSES_FILE, 'utf-8');
    const classes = JSON.parse(data) as Class[];
    
    // Update ID counter based on existing classes
    if (classes.length > 0) {
      const maxId = Math.max(...classes.map(c => c.id));
      classIdCounter = maxId + 1;
    }
    
    return classes;
  } catch (error) {
    console.error('Error loading classes:', error);
    return [];
  }
}

// Save classes to file
function saveClasses(classes: Class[]): void {
  try {
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classes, null, 2));
  } catch (error) {
    console.error('Error saving classes:', error);
  }
}

// Get all classes with filtering and pagination
function getClasses({ 
  page = 1, 
  limit = 10, 
  search = '', 
  category = '', 
  status = '' 
}: { 
  page: number; 
  limit: number; 
  search?: string; 
  category?: string; 
  status?: string 
}): { classes: Class[]; totalCount: number; totalPages: number } {
  let classes = loadClasses();
  
  // Apply filters
  if (search) {
    const searchLower = search.toLowerCase();
    classes = classes.filter(c => 
      c.title.toLowerCase().includes(searchLower) || 
      (c.description && c.description.toLowerCase().includes(searchLower))
    );
  }
  
  if (category) {
    classes = classes.filter(c => c.category === category);
  }
  
  if (status) {
    classes = classes.filter(c => c.status === status);
  }
  
  // Sort by date (newest first)
  classes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Get total count before pagination
  const totalCount = classes.length;
  
  // Apply pagination
  const startIndex = (page - 1) * limit;
  classes = classes.slice(startIndex, startIndex + limit);
  
  return {
    classes,
    totalCount,
    totalPages: Math.ceil(totalCount / limit)
  };
}

// Get a class by ID
function getClassById(id: number): Class | undefined {
  const classes = loadClasses();
  return classes.find(c => c.id === id);
}

// Create a new class
function createClass(classData: InsertClass & { instructorId: number }): Class {
  const classes = loadClasses();
  
  const newClass: Class = {
    ...classData,
    id: classIdCounter++,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enrollmentCount: 0,
    status: classData.status || 'published'
  };
  
  classes.push(newClass);
  saveClasses(classes);
  
  return newClass;
}

// Update an existing class
function updateClass(id: number, classData: Partial<InsertClass>): Class | undefined {
  const classes = loadClasses();
  const index = classes.findIndex(c => c.id === id);
  
  if (index === -1) {
    return undefined;
  }
  
  const updatedClass = {
    ...classes[index],
    ...classData,
    updatedAt: new Date().toISOString()
  };
  
  classes[index] = updatedClass;
  saveClasses(classes);
  
  return updatedClass;
}

// Delete a class
function deleteClass(id: number): boolean {
  const classes = loadClasses();
  const filteredClasses = classes.filter(c => c.id !== id);
  
  if (filteredClasses.length === classes.length) {
    return false; // No class was deleted
  }
  
  saveClasses(filteredClasses);
  return true;
}

export const classStorage = {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass
};