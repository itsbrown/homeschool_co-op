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
    const statusParam = req.query.status as string || '';
    
    // Validate status before using it
    let status: "published" | "draft" | "" = "";
    if (statusParam === "published" || statusParam === "draft") {
      status = statusParam;
    }
    
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
    
    // Extract unique category names using an object as a map
    const categoryNamesMap: {[key: string]: boolean} = {};
    
    allClasses.forEach(c => {
      if (c.categoryName) {
        categoryNamesMap[c.categoryName] = true;
      }
    });
    
    // Convert object keys to array
    const categoryNames = Object.keys(categoryNamesMap);
    
    res.json(categoryNames);
  } catch (error) {
    console.error('Error fetching category names:', error);
    res.status(500).json({ message: 'Failed to fetch category names' });
  }
});

// Enroll a child in a class
router.post('/:id/enroll', async (req, res) => {
  try {
    console.log(`📝 ENROLLMENT REQUEST: Class ${req.params.id}, Body:`, req.body);
    
    const classId = parseInt(req.params.id);
    const { childId } = req.body;

    console.log(`📝 ENROLLMENT PARSED: classId=${classId}, childId=${childId}`);

    if (isNaN(classId) || !childId) {
      console.log(`📝 ENROLLMENT VALIDATION FAILED: Invalid classId or childId`);
      return res.status(400).json({ message: 'Invalid class ID or child ID' });
    }

    // Get the class to verify it exists
    const classItem = await storage.getClassById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get the child to verify it exists
    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    // Calculate deposit (10% of class price)
    const classPrice = classItem.price || 90000; // Default $900 in cents
    const depositAmount = Math.round(classPrice * 0.1); // 10% deposit
    const remainingBalance = classPrice - depositAmount;

    // Create enrollment record
    const enrollment = {
      id: Date.now(), // Simple ID generation
      classId: classId,
      childId: childId,
      childName: `${child.firstName} ${child.lastName}`,
      className: classItem.title,
      enrollmentDate: new Date().toISOString(),
      status: 'pending_payment', // Changed to pending payment
      amount: 0, // Amount paid so far
      depositRequired: depositAmount,
      totalCost: classPrice,
      remainingBalance: classPrice // Full balance until deposit is paid
    };

    console.log(`📝 ENROLLMENT OBJECT CREATED:`, enrollment);

    // Save enrollment to storage
    const savedEnrollment = await storage.createEnrollment(enrollment);
    console.log(`📝 ENROLLMENT SAVED RESULT:`, savedEnrollment);

    // Note: Child enrollment tracking will be handled separately
    // For now, just create the enrollment record

    console.log(`✅ Successfully enrolled ${child.firstName} ${child.lastName} in class: ${classItem.title}`);
    
    res.json({ 
      message: 'Enrollment successful',
      enrollment: enrollment
    });

  } catch (error) {
    console.error('Error enrolling child in class:', error);
    res.status(500).json({ message: 'Failed to enroll child in class' });
  }
});

export default router;