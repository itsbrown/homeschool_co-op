
import express from "express";
import { storage } from "../storage";
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Get classes assigned to a specific educator by email
router.get('/classes', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`📚 Fetching classes for educator: ${email}`);

    // Read classes and staff data from files
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
    const STAFF_FILE = path.join(DATA_DIR, 'staff.json');

    let classes = [];
    let staff = [];

    if (fs.existsSync(CLASSES_FILE)) {
      const classesData = fs.readFileSync(CLASSES_FILE, 'utf8');
      classes = JSON.parse(classesData);
    }

    if (fs.existsSync(STAFF_FILE)) {
      const staffData = fs.readFileSync(STAFF_FILE, 'utf8');
      staff = JSON.parse(staffData);
    }

    // Find the staff member by email
    const staffMember = staff.find(s => s.email === email);
    if (!staffMember) {
      console.log(`❌ Staff member not found for email: ${email}`);
      return res.json([]);
    }

    // Find classes assigned to this educator
    // Classes can be assigned by instructorName, instructorEmail, or instructorId
    const assignedClasses = classes.filter(cls => 
      cls.instructorName === staffMember.name ||
      cls.instructorEmail === email ||
      cls.instructorId === staffMember.id ||
      cls.instructorName === `${staffMember.firstName} ${staffMember.lastName}`
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

    // Read data files
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
    const STAFF_FILE = path.join(DATA_DIR, 'staff.json');
    const CHILDREN_FILE = path.join(DATA_DIR, 'children.json');
    const ENROLLMENTS_FILE = path.join(DATA_DIR, 'enrollments.json');

    let classes = [];
    let staff = [];
    let children = [];
    let enrollments = [];

    if (fs.existsSync(CLASSES_FILE)) {
      classes = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf8'));
    }

    if (fs.existsSync(STAFF_FILE)) {
      staff = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
    }

    if (fs.existsSync(CHILDREN_FILE)) {
      children = JSON.parse(fs.readFileSync(CHILDREN_FILE, 'utf8'));
    }

    if (fs.existsSync(ENROLLMENTS_FILE)) {
      enrollments = JSON.parse(fs.readFileSync(ENROLLMENTS_FILE, 'utf8'));
    }

    // Find the staff member
    const staffMember = staff.find(s => s.email === email);
    if (!staffMember) {
      console.log(`❌ Staff member not found for email: ${email}`);
      return res.json({ students: [], totalStudents: 0 });
    }

    // Find classes assigned to this educator
    const assignedClasses = classes.filter(cls => 
      cls.instructorName === staffMember.name ||
      cls.instructorEmail === email ||
      cls.instructorId === staffMember.id ||
      cls.instructorName === `${staffMember.firstName} ${staffMember.lastName}`
    );

    const assignedClassIds = assignedClasses.map(cls => cls.id);

    // Find enrollments for these classes
    const relevantEnrollments = enrollments.filter(enrollment => 
      assignedClassIds.includes(enrollment.classId)
    );

    // Get student details with class information
    const studentsWithClasses = relevantEnrollments.map(enrollment => {
      const child = children.find(c => c.id === enrollment.childId);
      const classInfo = classes.find(c => c.id === enrollment.classId);
      
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

export default router;
