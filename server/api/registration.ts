import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
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
  })
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
      specialNeeds: '',
      interests: null,
      notes: '',
      emergencyContact: data.parent.phone,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const child = await storage.createChild(childData);
    console.log('👶 Created new child:', child.id);
    
    // Create enrollment
    const enrollmentData = {
      classId: data.enrollment.classId,
      childId: child.id,
      childName: `${data.child.firstName} ${data.child.lastName}`,
      enrollmentDate: new Date(),
      status: data.enrollment.status,
      depositPaid: data.enrollment.depositPaid,
      remainingBalance: data.enrollment.remainingBalance
    };
    
    // Get class information for enrollment
    const classInfo = await storage.getClass(data.enrollment.classId);
    if (classInfo) {
      enrollmentData.className = classInfo.title;
    }
    
    const enrollment = await storage.createEnrollment(enrollmentData);
    console.log('📚 Created enrollment:', enrollment.id);
    
    // Record payment
    const paymentRecord = {
      enrollmentId: enrollment.id,
      amount: data.payment.amount,
      transactionId: data.payment.transactionId,
      paymentType: 'deposit',
      status: 'completed',
      timestamp: data.payment.timestamp
    };
    
    // Store payment record if storage supports it
    if (storage.createPayment) {
      await storage.createPayment(paymentRecord);
    }
    
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
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : error.message
    });
  }
});

// Get published classes for registration
router.get('/classes', async (req, res) => {
  try {
    const classes = await storage.getPublishedClasses?.() || [];
    
    // Format classes for registration display
    const formattedClasses = classes.map(cls => ({
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