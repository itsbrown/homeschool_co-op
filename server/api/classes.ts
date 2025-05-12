import express from "express";
import { storage } from "../storage";

const router = express.Router();

// Get all classes with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const category = req.query.category as string || '';
    const categoryName = req.query.categoryName as string || '';
    const status = req.query.status as "published" | "draft" | "" || '';
    
    const options = {
      page,
      limit,
      search,
      category,
      status
    };
    
    // Get classes count for pagination
    const total = await storage.getClassesCount(options);
    
    // Get classes with pagination
    let classes = await storage.getClasses(options);
    
    // Additional filtering by categoryName if provided
    if (categoryName && classes.length > 0) {
      classes = classes.filter(c => c.categoryName === categoryName);
    }
    
    // Return classes with pagination metadata
    res.json({
      classes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

// Get class by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }
    
    const classItem = await storage.getClassById(id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    res.json(classItem);
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ message: 'Failed to fetch class' });
  }
});

// Get classes by category name (product category)
router.get('/category/:categoryName', async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Get all classes first
    const allClasses = await storage.getClasses({
      page: 1,
      limit: 1000, // Large limit to get all classes
      search: '',
      category: '',
      status: 'published'
    });
    
    // Filter by category name
    const filteredClasses = allClasses.filter(c => c.categoryName === categoryName);
    
    // Apply pagination manually
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedClasses = filteredClasses.slice(startIndex, endIndex);
    
    res.json({
      classes: paginatedClasses,
      pagination: {
        page,
        limit,
        total: filteredClasses.length,
        totalPages: Math.ceil(filteredClasses.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching classes by category:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

// Get unique category names
router.get('/categories/names', async (req, res) => {
  try {
    // Get all classes
    const allClasses = await storage.getClasses({
      page: 1,
      limit: 1000, // Large limit to get all classes
      search: '',
      category: '',
      status: 'published'
    });
    
    // Extract unique category names
    const categoryNames = [...new Set(allClasses.map(c => c.categoryName).filter(Boolean))];
    
    res.json(categoryNames);
  } catch (error) {
    console.error('Error fetching category names:', error);
    res.status(500).json({ message: 'Failed to fetch category names' });
  }
});

export default router;