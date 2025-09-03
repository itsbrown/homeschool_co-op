import { Router } from 'express';
import { storage } from '../storage';
import { jwtCheck, requireRole } from '../middleware/auth0-auth';
import { CurrencyUtils, BillingCalculationService } from '../../shared/currency-utils';

const router = Router();

// Get comprehensive parent profile data for school admin
router.get('/:parentId', jwtCheck, requireRole(['school_admin', 'schoolAdmin', 'superAdmin', 'admin']), async (req: any, res) => {
  try {
    const parentId = parseInt(req.params.parentId);
    
    if (isNaN(parentId)) {
      return res.status(400).json({ message: 'Invalid parent ID' });
    }

    console.log(`🔍 Fetching comprehensive profile for parent ID: ${parentId}`);

    // Get parent/user information
    const parent = await storage.getUser(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    // Only return profiles for parents
    if (parent.role !== 'parent') {
      return res.status(400).json({ message: 'User is not a parent' });
    }

    // Get children for this parent
    const children = await storage.getChildrenByParentEmail(parent.email);
    console.log(`👶 Found ${children.length} children for parent ${parent.email}`);

    // Get school student records to map child IDs to school student IDs
    const schoolStudents = await storage.getAllSchoolStudents();
    const childToSchoolStudentMap = new Map();
    schoolStudents.forEach(ss => {
      childToSchoolStudentMap.set(ss.childId, ss.id);
    });

    // Get enrollments for all children
    const allEnrollments = [];
    for (const child of children) {
      try {
        const childEnrollments = await storage.getEnrollmentsByChildId(child.id);
        console.log(`📚 Found ${childEnrollments.length} enrollments for child ${child.firstName} ${child.lastName}`);
        allEnrollments.push(...childEnrollments);
      } catch (error) {
        console.error(`❌ Error fetching enrollments for child ${child.id}:`, error);
      }
    }

    // Get payment history for this parent
    const paymentHistory = await storage.getPaymentsByParentEmail(parent.email);
    console.log(`💳 Found ${paymentHistory.length} payment records for parent ${parent.email}`);

    // Get scheduled payments
    const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(parent.email);
    console.log(`📅 Found ${scheduledPayments.length} scheduled payments for parent ${parent.email}`);

    // Get membership enrollments for this parent
    const membershipEnrollments = await storage.getMembershipEnrollmentsByParentId(parent.id);
    console.log(`🏅 Found ${membershipEnrollments.length} membership enrollments for parent ${parent.email}`);

    // Get emergency contacts for the children
    const emergencyContacts = [];
    for (const child of children) {
      if (child.emergencyContact) {
        emergencyContacts.push({
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          emergencyContact: child.emergencyContact
        });
      }
    }

    // Get classes information for enrollments
    const classIds = [...new Set(allEnrollments.map(e => e.classId))];
    const classes: any[] = [];
    for (const classId of classIds) {
      try {
        const classInfo = await storage.getClassById(classId);
        if (classInfo) {
          classes.push(classInfo);
        }
      } catch (error) {
        console.error(`❌ Error fetching class ${classId}:`, error);
      }
    }

    // Calculate summary statistics using unified billing service
    const totalAmountPaid = BillingCalculationService.calculateTotalPaid(paymentHistory);
    
    // Calculate total amount due by summing actual remaining balances (not stored values)
    const classAmountDue = CurrencyUtils.sum(
      allEnrollments.map(enrollment => {
        const enrollmentPayments = paymentHistory.filter(payment => 
          payment.childName === enrollment.childName &&
          ['completed', 'succeeded'].includes(payment.status)
        );
        const totalPaid = CurrencyUtils.sum(enrollmentPayments.map(p => p.amount || 0));
        const totalCost = enrollment.totalCost || 0;
        return CurrencyUtils.calculateBalance(totalCost, totalPaid);
      })
    );

    // Calculate membership amount due
    const membershipAmountDue = CurrencyUtils.sum(
      membershipEnrollments.map(membership => {
        const membershipPayments = paymentHistory.filter(payment => 
          payment.description?.includes('Membership') &&
          ['completed', 'succeeded'].includes(payment.status)
        );
        const totalPaid = CurrencyUtils.sum(membershipPayments.map(p => p.amount || 0));
        return CurrencyUtils.calculateBalance(membership.amount, totalPaid);
      })
    );

    // Total amount due includes both class and membership fees
    const totalAmountDue = classAmountDue + membershipAmountDue;

    const profile = {
      parent: {
        id: parent.id,
        firstName: parent.name?.split(' ')[0] || parent.username?.split(' ')[0] || '',
        lastName: parent.name?.split(' ')[1] || parent.username?.split(' ')[1] || '',
        email: parent.email,
        phone: parent.phone || '',
        role: parent.role,
        isActive: parent.isActive,
        createdAt: parent.createdAt,
        updatedAt: parent.updatedAt
      },
      children: children.map(child => ({
        id: child.id,
        schoolStudentId: childToSchoolStudentMap.get(child.id) || null,
        firstName: child.firstName,
        lastName: child.lastName,
        birthDate: child.birthdate,
        grade: child.gradeLevel,
        schoolId: child.school || null,
        parentEmail: child.parentEmail,
        allergies: child.allergies,
        medicalConditions: child.medicalInfo,
        emergencyContact: child.emergencyContact,
        additionalLanguages: child.additionalLanguages,
        notes: child.notes,
        createdAt: child.createdAt
      })),
      enrollments: allEnrollments.map(enrollment => {
        const classInfo = (classes as any[]).find(c => c.id === enrollment.classId);
        
        // Calculate actual payments made for this enrollment
        const enrollmentPayments = paymentHistory.filter(payment => 
          payment.childName === enrollment.childName &&
          ['completed', 'succeeded'].includes(payment.status)
        );
        
        const totalPaid = CurrencyUtils.sum(enrollmentPayments.map(p => p.amount || 0));
        const totalCost = enrollment.totalCost || 0;
        const actualRemainingBalance = CurrencyUtils.calculateBalance(totalCost, totalPaid);
        
        return {
          id: enrollment.id,
          classId: enrollment.classId,
          className: classInfo?.title || 'Unknown Class',
          classDescription: classInfo?.description,
          childId: enrollment.childId,
          childName: enrollment.childName,
          enrollmentDate: enrollment.enrollmentDate,
          status: enrollment.status,
          amount: CurrencyUtils.toDisplay(totalPaid),
          depositRequired: CurrencyUtils.toDisplay(enrollment.depositRequired || 0),
          totalCost: CurrencyUtils.toDisplay(totalCost),
          remainingBalance: CurrencyUtils.toDisplay(actualRemainingBalance),
          paymentPlan: enrollment.paymentPlan
        };
      }),
      membershipEnrollments: membershipEnrollments.map(membership => {
        // Get school info for membership display
        const school = classes.find(c => c.schoolId === membership.schoolId) || { schoolId: membership.schoolId };
        
        // Calculate actual membership payments made
        const membershipPayments = paymentHistory.filter(payment => 
          payment.description?.includes('Membership') &&
          ['completed', 'succeeded'].includes(payment.status)
        );
        
        const totalPaid = CurrencyUtils.sum(membershipPayments.map(p => p.amount || 0));
        const actualRemainingBalance = CurrencyUtils.calculateBalance(membership.amount, totalPaid);
        
        return {
          id: membership.id,
          schoolId: membership.schoolId,
          schoolName: school.schoolName || 'Unknown School',
          membershipYear: membership.membershipYear,
          amount: CurrencyUtils.toDisplay(totalPaid),
          totalCost: CurrencyUtils.toDisplay(membership.amount),
          remainingBalance: CurrencyUtils.toDisplay(actualRemainingBalance),
          status: membership.status,
          dueDate: membership.dueDate,
          expirationDate: membership.expirationDate,
          gracePeriodEnd: membership.gracePeriodEnd
        };
      }),
      paymentHistory: paymentHistory.map(payment => ({
        id: payment.id,
        amount: CurrencyUtils.toDisplay(payment.amount || 0),
        status: payment.status,
        paymentDate: payment.createdAt,
        paymentMethod: 'stripe',
        description: `${payment.childName} - ${payment.className}`,
        transactionId: payment.stripePaymentIntentId
      })),
      scheduledPayments: scheduledPayments.map(payment => ({
        id: payment.id,
        amount: CurrencyUtils.toDisplay(payment.amount || 0),
        dueDate: payment.dueDate,
        status: payment.status,
        description: payment.description || '',
        enrollmentId: payment.enrollmentIds?.[0] || null
      })),
      emergencyContacts,
      summary: {
        totalChildren: children.length,
        totalEnrollments: allEnrollments.length,
        totalMemberships: membershipEnrollments.length,
        totalAmountPaid: CurrencyUtils.toDisplay(totalAmountPaid),
        totalAmountDue: CurrencyUtils.toDisplay(totalAmountDue),
        activeEnrollments: allEnrollments.filter(e => ['enrolled', 'pending_payment'].includes(e.status)).length,
        activeMemberships: membershipEnrollments.filter(m => ['active', 'pending_payment'].includes(m.status)).length
      }
    };

    console.log(`✅ Successfully compiled profile for ${parent.name || parent.username}`);
    return res.status(200).json(profile);

  } catch (error) {
    console.error('❌ Error fetching parent profile:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'PARENT_PROFILE_FETCH_ERROR'
    });
  }
});

export default router;