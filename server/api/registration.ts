import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";
// Email service will be implemented separately

const router = Router();

// Schema for complete registration
const completeRegistrationSchema = z.object({
  parent: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string(),
    role: z.literal('parent')
  }),
  child: z.object({
    firstName: z.string(),
    lastName: z.string(),
    age: z.number(),
    gradeLevel: z.string(),
    birthdate: z.string(),
    parentEmail: z.string()
  }),
  enrollment: z.object({
    classId: z.number(),
    status: z.string(),
    depositPaid: z.number(),
    remainingBalance: z.number()
  }),
  payment: z.object({
    success: z.boolean(),
    transactionId: z.string(),
    amount: z.number(),
    timestamp: z.string()
  }),
  schoolId: z.number().optional()
});

// Complete registration endpoint
router.post('/complete', async (req, res) => {
  try {
    const data = completeRegistrationSchema.parse(req.body);
    
    console.log('🎯 Processing complete registration for:', data.parent.email);
    
    // Create or get parent user
    let parentUser = await storage.getUserByEmail?.(data.parent.email);
    if (!parentUser) {
      const parentData = {
        email: data.parent.email,
        firstName: data.parent.firstName,
        lastName: data.parent.lastName,
        phone: data.parent.phone,
        name: `${data.parent.firstName} ${data.parent.lastName}`,
        username: data.parent.email,
        password: '',
        role: 'parent' as const,
        schoolId: data.schoolId || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      parentUser = await storage.createUser(parentData);
      console.log('👤 Created new parent user:', parentUser.id);
    } else if (data.schoolId && !parentUser.schoolId) {
      // Associate existing user with school
      try {
        await storage.updateUser?.(parentUser.id, { schoolId: data.schoolId });
        parentUser.schoolId = data.schoolId;
        console.log('🔗 Associated existing parent with school:', data.schoolId);
      } catch (error) {
        console.warn('⚠️ Could not update parent school association:', error);
      }
    }
    
    // Create child record
    const childData = {
      firstName: data.child.firstName,
      lastName: data.child.lastName,
      birthdate: data.child.birthdate,
      gradeLevel: data.child.gradeLevel,
      parentId: parentUser.id,
      parentEmail: data.parent.email,
      school: null,
      schoolId: parentUser.schoolId || null,
      locationId: null,
      gender: null,
      learningStyle: null,
      specialNeeds: '',
      interests: null,
      notes: '',
      emergencyContact: data.parent.phone,
      medicalInfo: null,
      allergies: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const child = await storage.createChild(childData);
    console.log('👶 Created new child:', child.id);
    
    // Get class information for enrollment
    const allClasses = await storage.getClasses();
    const classInfo = allClasses.find(c => c.id === data.enrollment.classId);
    if (!classInfo) {
      throw new Error('Class not found');
    }
    
    // Create complete enrollment using factory function
    const enrollmentData = createEnrollmentDataSimple({
      schoolId: parentUser.schoolId || child.schoolId || classInfo.schoolId || null,
      parentId: parentUser.id,
      parentEmail: data.parent.email,
      childId: child.id,
      childName: `${data.child.firstName} ${data.child.lastName}`,
      classId: data.enrollment.classId,
      className: classInfo.title,
      classType: 'school_class',
      totalCost: classInfo.price || 0,
      depositRequired: data.enrollment.depositPaid || 0,
      totalPaid: data.enrollment.depositPaid || 0,
      remainingBalance: data.enrollment.remainingBalance || 0,
      paymentStatus: data.payment.success ? 'deposit_paid' : 'pending',
      programStartDate: classInfo.startDate || new Date(),
      programEndDate: classInfo.endDate || new Date(),
      status: data.enrollment.status as any || 'enrolled'
    });
    
    const enrollment = await storage.createProgramEnrollment(enrollmentData);
    console.log('📚 Created enrollment:', enrollment.id);
    
    // Skip payment recording for now - this endpoint is not actively used
    // Payment recording is handled by the Stripe webhook system
    
    console.log('✅ Registration completed successfully');
    
    res.json({
      success: true,
      parentId: parentUser.id,
      childId: child.id,
      enrollmentId: enrollment.id,
      message: 'Registration completed successfully'
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : errorMessage
    });
  }
});

// Get published classes for registration
router.get('/classes', async (req, res) => {
  try {
    const allClasses = await storage.getClasses();
    const classes = allClasses.filter((c: any) => c.published || c.status === 'active');
    
    // Format classes for registration display
    const formattedClasses = classes.map((cls: any) => ({
      id: cls.id,
      title: cls.title,
      description: cls.description,
      price: cls.price || 900,
      ageRange: cls.ageRange || 'All ages',
      schedule: cls.schedule || 'TBD',
      location: cls.location || 'Brighton',
      capacity: cls.capacity || 10,
      enrollmentCount: cls.enrollmentCount || 0,
      spotsAvailable: (cls.capacity || 10) - (cls.enrollmentCount || 0)
    }));
    
    res.json(formattedClasses);
  } catch (error) {
    console.error('❌ Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

export default router;