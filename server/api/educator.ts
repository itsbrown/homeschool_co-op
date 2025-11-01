
import express from "express";
import { storage } from "../storage";

const router = express.Router();

// Get classes assigned to a specific educator by email
router.get('/classes', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`📚 Fetching classes for educator: ${email}`);

    // Get the educator from the database
    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`❌ Educator not found for email: ${email}`);
      return res.json([]);
    }

    // Get all classes and filter by instructor
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === educator.id ||
      cls.instructorName === educator.name
    );

    console.log(`✅ Found ${assignedClasses.length} classes for educator ${email}`);
    
    res.json(assignedClasses);
  } catch (error) {
    console.error('❌ Error fetching educator classes:', error);
    res.status(500).json({ message: 'Failed to fetch educator classes' });
  }
});

// Get students for classes taught by a specific educator
router.get('/students', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`👥 Fetching students for educator: ${email}`);

    // Get the educator from the database
    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`❌ Educator not found for email: ${email}`);
      return res.json({ students: [], totalStudents: 0 });
    }

    // Get all classes and filter by instructor
    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === educator.id ||
      cls.instructorName === educator.name
    );

    console.log(`📚 Found ${assignedClasses.length} classes for educator`);

    const assignedClassIds = assignedClasses.map(cls => cls.id);

    // Get all children for lookup
    const allChildren = await storage.getAllChildren();

    // Get enrollments for all assigned classes
    const enrollmentsByClass = await Promise.all(
      assignedClassIds.map(classId => 
        storage.getMarketplaceEnrollmentsByClassId(classId)
      )
    );

    // Flatten enrollments array
    const allEnrollments = enrollmentsByClass.flat();

    // Get student details with class information
    const studentsWithClasses = allEnrollments.map(enrollment => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      const classInfo = assignedClasses.find(c => c.id === enrollment.classId);
      
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          parentEmail: child.parentEmail,
          classId: enrollment.classId,
          className: classInfo ? classInfo.title : 'Unknown Class',
          enrollmentDate: enrollment.enrollmentDate,
          enrollmentStatus: enrollment.status
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`✅ Found ${studentsWithClasses.length} students for educator ${email}`);
    
    res.json({
      students: studentsWithClasses,
      totalStudents: studentsWithClasses.length,
      assignedClasses: assignedClasses.length
    });
  } catch (error) {
    console.error('❌ Error fetching educator students:', error);
    res.status(500).json({ message: 'Failed to fetch educator students' });
  }
});

// Get students for a specific class (only if educator teaches that class)
router.get('/class-students/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`👥 Fetching students for class ${classId}, educator: ${email}`);

    // Get the educator from the database
    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`❌ Educator not found for email: ${email}`);
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Get the specific class
    const targetClass = await storage.getClassById(parseInt(classId));
    if (!targetClass) {
      console.log(`❌ Class not found: ${classId}`);
      return res.status(404).json({ message: 'Class not found' });
    }

    // Verify this educator teaches this class
    const isAuthorized = 
      targetClass.instructorId === educator.id ||
      targetClass.instructorName === educator.name;

    if (!isAuthorized) {
      console.log(`❌ Educator ${email} not authorized for class ${classId}`);
      return res.status(403).json({ message: 'You are not authorized to view this class' });
    }

    // Get enrollments for this specific class
    const classEnrollments = await storage.getMarketplaceEnrollmentsByClassId(parseInt(classId));

    // Get all children for lookup
    const allChildren = await storage.getAllChildren();

    // Get student details
    const studentsInClass = classEnrollments.map(enrollment => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          birthdate: child.birthdate,
          parentEmail: child.parentEmail,
          enrollmentDate: enrollment.createdAt || enrollment.enrollmentDate,
          interests: child.interests,
          specialNeeds: child.specialNeeds
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`✅ Found ${studentsInClass.length} students for class ${classId}`);
    
    res.json({
      students: studentsInClass,
      totalStudents: studentsInClass.length,
      classInfo: {
        id: targetClass.id,
        title: targetClass.title,
        capacity: targetClass.capacity
      }
    });
  } catch (error) {
    console.error('❌ Error fetching class students:', error);
    res.status(500).json({ message: 'Failed to fetch class students' });
  }
});

export default router;
