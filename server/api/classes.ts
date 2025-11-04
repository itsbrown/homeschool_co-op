import express from "express";
import { storage } from "../storage";
import { sendWaitlistJoinedEmail, sendWaitlistPromotedEmail } from "../lib/email-service";

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

    // Filter out admin-only classes for public API
    classes = classes.filter(c => !c.isAdminOnly);

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

    // Filter by category name and exclude admin-only classes
    const filteredClasses = allClasses.filter(c => c.categoryName === categoryName && !c.isAdminOnly);

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

    // Check class capacity and enrollment count
    const capacity = classItem.capacity || 0;
    const currentEnrollmentCount = classItem.enrollmentCount || 0;
    const isAtCapacity = capacity > 0 && currentEnrollmentCount >= capacity;

    // Calculate waitlist position if at capacity
    let waitlistPosition = null;
    let enrollmentStatus = 'enrolled';
    
    if (isAtCapacity) {
      // Get current waitlist count for this class
      const waitlistCount = classItem.totalWaitlisted || 0;
      waitlistPosition = waitlistCount + 1; // Next position in waitlist
      enrollmentStatus = 'waitlist';
      
      console.log(`⚠️ Class is at capacity (${currentEnrollmentCount}/${capacity}). Adding to waitlist at position ${waitlistPosition}`);
    } else {
      console.log(`✅ Class has ${capacity - currentEnrollmentCount} spots available`);
    }

    // Calculate deposit (10% of class price)
    const classPrice = classItem.price || 90000; // Default $900 in cents
    const depositAmount = Math.round(classPrice * 0.1); // 10% deposit

    // Create enrollment record with ALL required fields
    const enrollment = {
      schoolId: classItem.schoolId || 1, // Get from class
      classType: 'marketplace' as const, // This is a marketplace class
      classId: null, // Not a school_class, so null
      marketplaceClassId: classId, // This is the marketplace class ID
      childId: childId,
      childName: `${child.firstName} ${child.lastName}`,
      className: classItem.title,
      variantId: null,
      parentId: child.parentId,
      parentEmail: child.parentEmail, // Get from child record
      totalCost: classPrice,
      totalPaid: 0,
      remainingBalance: classPrice,
      depositRequired: depositAmount,
      paymentStatus: 'pending' as const,
      paymentPlan: 'deposit_only' as const,
      paymentFrequency: 'one_time' as const,
      paymentSystemVersion: 'v2_stripe',
      programStartDate: classItem.startDate || null,
      programEndDate: classItem.endDate || null,
      status: enrollmentStatus as any,
      waitlistPosition: waitlistPosition,
      enrollmentDate: new Date(),
      stripeSubscriptionId: null,
      stripeSubscriptionScheduleId: null,
      stripeCustomerId: null,
      transactionId: null,
      discountCode: null,
      discountAmount: null
    };

    console.log(`📝 ENROLLMENT OBJECT CREATED:`, enrollment);

    // Save enrollment to storage
    const savedEnrollment = await storage.createEnrollment(enrollment);
    console.log(`📝 ENROLLMENT SAVED RESULT:`, savedEnrollment);

    // Note: Child enrollment tracking will be handled separately
    // For now, just create the enrollment record

    // Send appropriate message based on enrollment status
    const message = enrollmentStatus === 'waitlist'
      ? `Added to waitlist at position #${waitlistPosition}. You'll be notified when a spot opens up.`
      : 'Enrollment successful';
    
    console.log(`✅ ${enrollmentStatus === 'waitlist' ? 'Waitlisted' : 'Enrolled'} ${child.firstName} ${child.lastName} in class: ${classItem.title}`);

    // Send email notification for waitlist
    if (enrollmentStatus === 'waitlist') {
      const parentEmail = req.body.parentEmail || '';
      const parentName = req.body.parentName || 'Parent';
      
      if (parentEmail) {
        await sendWaitlistJoinedEmail({
          parentEmail,
          parentName,
          childName: `${child.firstName} ${child.lastName}`,
          className: classItem.title,
          waitlistPosition: waitlistPosition || 0,
          programStartDate: classItem.startDate ? new Date(classItem.startDate) : undefined
        });
        console.log(`📧 Sent waitlist joined email to ${parentEmail}`);
      }
    }

    res.json({ 
      message,
      enrollment: enrollment,
      isWaitlisted: enrollmentStatus === 'waitlist',
      waitlistPosition: waitlistPosition
    });

  } catch (error) {
    console.error('Error enrolling child in class:', error);
    res.status(500).json({ message: 'Failed to enroll child in class' });
  }
});

// Helper function to promote next waitlisted student
async function promoteNextWaitlistedStudent(classId: number) {
  try {
    // Get all enrollments for this class
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    
    // Filter waitlisted enrollments for this class
    const waitlistedEnrollments = allEnrollments
      .filter((e: any) => e.classId === classId && e.status === 'waitlist')
      .sort((a: any, b: any) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));
    
    if (waitlistedEnrollments.length === 0) {
      console.log('📋 No waitlisted students to promote');
      return null;
    }
    
    // Get the first student in waitlist (lowest position number)
    const nextStudent = waitlistedEnrollments[0];
    
    console.log(`🎯 Promoting student from waitlist: ${nextStudent.childName} (position ${nextStudent.waitlistPosition})`);
    
    // Update the enrollment status to pending_payment
    const updatedEnrollment = {
      ...nextStudent,
      status: 'pending_payment',
      waitlistPosition: null, // Remove from waitlist
    };
    
    await storage.updateEnrollment(nextStudent.id, updatedEnrollment);
    
    // Update waitlist positions for remaining students
    for (let i = 1; i < waitlistedEnrollments.length; i++) {
      const student = waitlistedEnrollments[i];
      await storage.updateEnrollment(student.id, {
        ...student,
        waitlistPosition: i // New position (1-indexed)
      });
    }
    
    console.log(`✅ Promoted ${nextStudent.childName} from waitlist to enrolled`);
    
    // Send email notification to parent
    try {
      const classData = await storage.getClassById(classId);
      // Try to get parent email - you may need to adapt this based on your data structure
      // For now, we'll log that we need parent contact info
      // In a real scenario, you'd need to fetch this from the enrollment or child record
      console.log(`📧 Email notification needed for promotion: ${nextStudent.childName} to ${classData?.title}`);
      
      // If we have parent email in the enrollment data, send the email
      if (nextStudent.parentEmail && classData) {
        await sendWaitlistPromotedEmail({
          parentEmail: nextStudent.parentEmail,
          parentName: nextStudent.parentName || 'Parent',
          childName: nextStudent.childName,
          className: classData.title,
          programStartDate: classData.startDate ? new Date(classData.startDate) : undefined,
          price: classData.price || 0
        });
        console.log(`📧 Sent waitlist promotion email to ${nextStudent.parentEmail}`);
      }
    } catch (emailError) {
      console.error('Error sending promotion email:', emailError);
      // Don't fail the promotion if email fails
    }
    
    return nextStudent;
  } catch (error) {
    console.error('Error promoting waitlisted student:', error);
    return null;
  }
}

// Unenroll a child from a class
router.delete('/:id/enroll/:enrollmentId', async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const enrollmentId = parseInt(req.params.enrollmentId);

    console.log(`📝 UNENROLLMENT REQUEST: Class ${classId}, Enrollment ${enrollmentId}`);

    if (isNaN(classId) || isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid class ID or enrollment ID' });
    }

    // Get the enrollment to verify it exists and check status
    const enrollment = await storage.getEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Only allow unenrollment if payment is pending (not yet paid)
    if (enrollment.status !== 'pending_payment' && enrollment.status !== 'waitlist') {
      return res.status(400).json({ 
        message: 'Cannot unenroll from a class that has already been paid for' 
      });
    }

    // Delete the enrollment
    await storage.deleteEnrollment(enrollmentId);

    console.log(`✅ Successfully unenrolled child from class: ${enrollment.className}`);

    // If this was an enrolled student (not waitlisted), try to promote next waitlisted student
    if (enrollment.status === 'pending_payment') {
      const promoted = await promoteNextWaitlistedStudent(classId);
      
      if (promoted) {
        console.log(`🎉 Auto-promoted ${promoted.childName} from waitlist`);
      }
    }

    res.json({ 
      message: 'Unenrollment successful',
      enrollmentId: enrollmentId
    });

  } catch (error) {
    console.error('Error unenrolling child from class:', error);
    res.status(500).json({ message: 'Failed to unenroll child from class' });
  }
});

// Get published classes
router.get("/published", async (req, res) => {
  try {
    const { schoolId } = req.query;
    let classes = await storage.getPublishedClasses?.() || [];

    // Filter by school if schoolId is provided
    if (schoolId) {
      classes = classes.filter(cls => cls.schoolId === parseInt(schoolId as string));
    }

    res.json(classes);
  } catch (error: any) {
    console.error("Error fetching published classes:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;