import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { CurrencyUtils, BillingCalculationService } from '../../shared/currency-utils';

const router = Router();

// Get comprehensive parent profile data for school admin
router.get('/:parentId', supabaseAuth, async (req: any, res) => {
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

    // Check if user has a parent role using the user_roles table (multi-role system)
    // This handles users who may have multiple roles or whose legacy users.role field is outdated
    const parentUserRoles = await storage.getUserRolesByUserId(parentId);
    const hasParentRole = parentUserRoles.some(r => r.role === 'parent');
    
    // Also check the legacy role field for backwards compatibility
    const isParentByLegacyRole = parent.role === 'parent';
    
    if (!hasParentRole && !isParentByLegacyRole) {
      console.log(`⚠️ User ${parentId} is not a parent. Roles: ${parentUserRoles.map(r => r.role).join(', ')}, legacy role: ${parent.role}`);
      return res.status(400).json({ message: 'User is not a parent' });
    }

    // SECURITY: Multi-tenant isolation - determine admin's permitted school IDs
    const adminEmail = req.user?.email; // Supabase auth provides email in req.user
    if (!adminEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get admin user from database to check role and school access
    const adminUser = await storage.getUserByEmail(adminEmail);
    if (!adminUser) {
      return res.status(401).json({ message: 'Admin user not found' });
    }

    // Determine effective role (from active user_roles entry for multi-role users)
    let adminRole = adminUser.role; // Default to primary role
    let adminSchoolIds: number[] = [];
    let isSuperAdmin = false;

    // For multi-role users, get role and school from active role
    if (adminUser.activeRoleId) {
      const { getDb } = await import('../db');
      const { userRoles } = await import('../../shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const db = await getDb();
      const activeRoles = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.id, adminUser.activeRoleId))
        .limit(1);
      
      if (activeRoles.length > 0) {
        adminRole = activeRoles[0].role; // Use active role for authorization
        if (activeRoles[0].schoolId) {
          adminSchoolIds = [activeRoles[0].schoolId];
          console.log(`🏫 Admin ${adminEmail} using active role (${adminRole}) with school ID:`, activeRoles[0].schoolId);
        }
      }
    }

    // Authorization check based on effective role
    if (adminRole === 'superAdmin' || adminRole === 'admin') {
      // SuperAdmin and Admin can view all data
      isSuperAdmin = true;
      console.log(`🔑 ${adminRole} ${adminEmail} has unrestricted access`);
    } else if (adminRole === 'schoolAdmin') {
      // School admins can only view data from their schools
      if (adminSchoolIds.length === 0) {
        // No school from active role, try legacy path
        const adminSchools = await storage.getSchoolsByAdminId(adminUser.id);
        if (!adminSchools || adminSchools.length === 0) {
          return res.status(403).json({ message: 'You must be associated with a school to view parent profiles' });
        }
        adminSchoolIds = adminSchools.map(s => s.id);
        console.log(`🏫 Admin ${adminEmail} has access to schools (legacy):`, adminSchoolIds);
      }
    } else {
      // Non-admin users cannot view parent profiles
      return res.status(403).json({ message: 'You do not have permission to view parent profiles' });
    }

    // Get ALL children for this parent
    const allChildren = await storage.getChildrenByParentEmail(parent.email);
    
    // For school admins, we need to determine visibility based on multiple factors:
    // 1. Child's schoolId matches admin's school
    // 2. Child has enrollments in admin's school's classes
    // 3. Parent has a role (registration) at admin's school - makes ALL their children visible
    // 4. Parent has a membership enrollment at admin's school - makes ALL their children visible
    let children = allChildren;
    let parentHasSchoolRelationship = false;
    
    if (!isSuperAdmin && allChildren.length > 0) {
      // First, check if parent has a direct relationship with admin's school
      // This would make ALL children visible regardless of individual child schoolId
      
      // Check 1: Parent has a role at admin's school
      const parentRolesAtAdminSchools = parentUserRoles.filter(r => 
        r.role === 'parent' && r.schoolId && adminSchoolIds.includes(r.schoolId)
      );
      if (parentRolesAtAdminSchools.length > 0) {
        parentHasSchoolRelationship = true;
        console.log(`✅ Parent ${parent.email} has role at admin's school - all children visible`);
      }
      
      // Check 2: Parent has a membership enrollment at admin's school
      if (!parentHasSchoolRelationship) {
        const parentMemberships = await storage.getMembershipEnrollmentsByParentId(parent.id);
        const membershipAtAdminSchool = parentMemberships.find(m => adminSchoolIds.includes(m.schoolId));
        if (membershipAtAdminSchool) {
          parentHasSchoolRelationship = true;
          console.log(`✅ Parent ${parent.email} has membership at admin's school - all children visible`);
        }
      }
      
      // Check 3: Parent's legacy schoolId matches admin's school
      if (!parentHasSchoolRelationship && parent.schoolId && adminSchoolIds.includes(parent.schoolId)) {
        parentHasSchoolRelationship = true;
        console.log(`✅ Parent ${parent.email} has legacy schoolId matching admin's school - all children visible`);
      }
      
      // If parent has relationship with school, all children are visible
      if (parentHasSchoolRelationship) {
        children = allChildren;
        console.log(`👶 Parent-school relationship found: showing all ${children.length} children`);
      } else {
        // Fall back to per-child visibility checks (enrollment-based or child schoolId-based)
        const allChildIds = allChildren.map(c => c.id);
        
        // Fetch all enrollments for all children in one batch
        const allChildEnrollments = await storage.getEnrollmentsByChildIds(allChildIds);
        
        // Get class IDs from enrollments to determine which schools they belong to
        const enrollmentClassIds = [...new Set(allChildEnrollments.map(e => e.classId).filter((id): id is number => id !== null))];
        
        // Build a map of classId -> schoolId
        const enrollmentClassSchoolMap = new Map<number, number>();
        for (const classId of enrollmentClassIds) {
          try {
            const classInfo = await storage.getClassById(classId);
            if (classInfo && classInfo.schoolId) {
              enrollmentClassSchoolMap.set(classId, classInfo.schoolId);
            }
          } catch (error) {
            console.error(`❌ Error fetching class ${classId} for enrollment check:`, error);
          }
        }
        
        // Build a map of child IDs to their enrolled school IDs (from class enrollments)
        const childToEnrolledSchoolId = new Map<number, number>();
        const childrenWithEnrollmentsInAdminSchool = new Set<number>();
        
        for (const enrollment of allChildEnrollments) {
          if (enrollment.classId === null) continue;
          const classSchoolId = enrollmentClassSchoolMap.get(enrollment.classId);
          if (classSchoolId && adminSchoolIds.includes(classSchoolId)) {
            childrenWithEnrollmentsInAdminSchool.add(enrollment.childId);
            if (!childToEnrolledSchoolId.has(enrollment.childId)) {
              childToEnrolledSchoolId.set(enrollment.childId, classSchoolId);
            }
          }
        }
        
        // Filter children: include if schoolId matches OR has enrollments in admin's school
        children = allChildren.filter(child => 
          (child.schoolId && adminSchoolIds.includes(child.schoolId)) ||
          childrenWithEnrollmentsInAdminSchool.has(child.id)
        );
        
        // Auto-sync schoolId for children with enrollments but missing schoolId
        for (const child of children) {
          if (!child.schoolId && childrenWithEnrollmentsInAdminSchool.has(child.id)) {
            const enrolledSchoolId = childToEnrolledSchoolId.get(child.id);
            if (enrolledSchoolId) {
              try {
                await storage.updateChild(child.id, { schoolId: enrolledSchoolId });
                child.schoolId = enrolledSchoolId;
                console.log(`🔄 Auto-synced schoolId for child ${child.id} (${child.firstName} ${child.lastName}) to school ${enrolledSchoolId}`);
              } catch (error) {
                console.error(`❌ Failed to auto-sync schoolId for child ${child.id}:`, error);
              }
            }
          }
        }
      }
    }
    
    console.log(`👶 Found ${allChildren.length} total children, ${children.length} visible to admin (includes enrollment-based visibility)`);

    // Check if admin has any access to this parent
    if (!isSuperAdmin && children.length === 0) {
      // No children visible, check for membership enrollments
      const allMembershipEnrollments = await storage.getMembershipEnrollmentsByParentId(parent.id);
      const visibleMemberships = allMembershipEnrollments.filter(m => adminSchoolIds.includes(m.schoolId));
      
      if (visibleMemberships.length === 0) {
        // No memberships visible, check if parent has a role in admin's schools
        const visibleRoles = parentUserRoles.filter(r => 
          r.role === 'parent' && r.schoolId && adminSchoolIds.includes(r.schoolId)
        );
        
        // SPECIAL CASE: Allow access to "orphaned" parent accounts
        // These are users who logged in via Google OAuth but haven't completed registration
        // They have a parent role with schoolId = null
        const isOrphanedParent = parentUserRoles.some(r => 
          r.role === 'parent' && r.schoolId === null
        ) || (isParentByLegacyRole && parent.schoolId === null);
        
        if (visibleRoles.length === 0 && !isOrphanedParent) {
          console.log(`⛔ Access denied: Admin ${adminEmail} has no relationship with parent ${parent.email}`);
          return res.status(403).json({ message: 'You do not have permission to view this parent profile' });
        }
        
        if (isOrphanedParent) {
          console.log(`⚠️ Orphaned parent account detected: ${parent.email} - allowing admin access for association`);
        } else {
          console.log(`✅ Access granted via parent role in admin's school`);
        }
      }
    }

    console.log(`✅ Access granted: Admin ${adminEmail} can view parent ${parent.email}`);

    // Get school student records to map child IDs to school student IDs
    const schoolStudents = await storage.getAllSchoolStudents();
    const childToSchoolStudentMap = new Map();
    schoolStudents.forEach(ss => {
      childToSchoolStudentMap.set(ss.childId, ss.id);
    });

    // Get enrollments for VISIBLE children only (already filtered)
    const allEnrollments = [];
    for (const child of children) {
      try {
        const childEnrollments = await storage.getEnrollmentsByChildId(child.id);
        allEnrollments.push(...childEnrollments);
      } catch (error) {
        console.error(`❌ Error fetching enrollments for child ${child.id}:`, error);
      }
    }

    // Get classes information for enrollments to filter by school
    const classIds = [...new Set(allEnrollments.map(e => e.classId))];
    const classes: any[] = [];
    const classSchoolMap = new Map<number, number>(); // classId -> schoolId
    
    for (const classId of classIds) {
      try {
        const classInfo = await storage.getClassById(classId);
        if (classInfo) {
          classes.push(classInfo);
          if (classInfo.schoolId !== null) {
            classSchoolMap.set(classInfo.id, classInfo.schoolId);
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching class ${classId}:`, error);
      }
    }

    // FILTER: Only enrollments in classes from admin's schools
    const filteredEnrollments = isSuperAdmin
      ? allEnrollments
      : allEnrollments.filter(e => {
          const classSchoolId = classSchoolMap.get(e.classId);
          return classSchoolId && adminSchoolIds.includes(classSchoolId);
        });
    
    console.log(`📚 Found ${allEnrollments.length} total enrollments, ${filteredEnrollments.length} visible to admin`);

    // FILTER: Only membership enrollments from admin's schools
    const allMembershipEnrollments = await storage.getMembershipEnrollmentsByParentId(parent.id);
    const membershipEnrollments = isSuperAdmin
      ? allMembershipEnrollments
      : allMembershipEnrollments.filter(m => adminSchoolIds.includes(m.schoolId));
    
    console.log(`🏅 Found ${allMembershipEnrollments.length} total memberships, ${membershipEnrollments.length} visible to admin`);

    // Get ALL payment history
    const allPaymentHistory = await storage.getPaymentsByParentEmail(parent.email);
    
    // FILTER: Only payments strictly tied to filtered enrollments or memberships
    // Create a mapping of valid child+class combinations from filtered enrollments
    const validEnrollmentKeys = new Set(
      filteredEnrollments.map(e => {
        const className = classes.find(c => c.id === e.classId)?.title || '';
        return `${e.childName}|${className}`;
      })
    );
    
    // Create a set of visible membership school IDs
    const visibleMembershipSchoolIds = new Set(
      membershipEnrollments.map(m => m.schoolId)
    );
    
    const paymentHistory = allPaymentHistory.filter(payment => {
      // For membership payments, use conservative filtering
      if (payment.description?.includes('Membership')) {
        // TODO: SECURITY ENHANCEMENT NEEDED
        // The payment schema lacks membershipEnrollmentId, making deterministic filtering impossible.
        // Proper fix: Add membershipEnrollmentId to payment schema and populate it during payment creation.
        // See: Architect recommendation to extend payment schema with authoritative membership links.
        //
        // CONSERVATIVE APPROACH: Exclude membership payments unless we can verify ownership
        // This prevents cross-school data leaks at the cost of potentially hiding valid payments.
        // When membershipEnrollmentId is added to schema, this filter should become:
        // return membershipEnrollments.some(m => payment.membershipEnrollmentId === m.id);
        
        console.warn(`⚠️ Membership payment filtering is conservative - may exclude valid payments without membershipEnrollmentId`);
        return false; // Exclude all membership payments for now to prevent leaks
      }
      
      // For class payments, only include if for a filtered enrollment
      const paymentKey = `${payment.childName}|${payment.className}`;
      return validEnrollmentKeys.has(paymentKey);
    });
    
    console.log(`💳 Found ${allPaymentHistory.length} total payments, ${paymentHistory.length} visible to admin`);

    // Get ALL scheduled payments
    const allScheduledPayments = await storage.getScheduledPaymentsByParentEmail(parent.email);
    
    // FILTER: Only scheduled payments linked to filtered enrollments
    const filteredEnrollmentIds = new Set(filteredEnrollments.map(e => e.id));
    const scheduledPayments = allScheduledPayments.filter(payment => {
      // Check if the payment's enrollment ID is in filtered set
      return payment.enrollmentId && filteredEnrollmentIds.has(payment.enrollmentId);
    });
    
    console.log(`📅 Found ${allScheduledPayments.length} total scheduled payments, ${scheduledPayments.length} visible to admin`);

    // Get emergency contacts for the VISIBLE children only
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

    // Calculate summary statistics using FILTERED data only
    const totalAmountPaid = BillingCalculationService.calculateTotalPaid(paymentHistory);
    
    // Calculate total amount due by summing actual remaining balances (using FILTERED enrollments)
    const classAmountDue = CurrencyUtils.sum(
      filteredEnrollments.map(enrollment => {
        const enrollmentPayments = paymentHistory.filter(payment => 
          payment.childName === enrollment.childName &&
          ['completed', 'succeeded'].includes(payment.status)
        );
        const totalPaid = CurrencyUtils.sum(enrollmentPayments.map(p => p.amount || 0));
        const totalCost = enrollment.totalCost || 0;
        return CurrencyUtils.calculateBalance(totalCost, totalPaid);
      })
    );

    // Calculate membership amount due (using FILTERED memberships)
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

    // Total amount due includes both class and membership fees (FILTERED data only)
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
        updatedAt: parent.updatedAt,
        memberId: parent.memberId || null
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
      enrollments: filteredEnrollments.map(enrollment => {
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
          gracePeriodEnd: membership.gracePeriodEnd,
          startDate: membership.startDate,
          renewalDate: membership.renewalDate,
          membershipTier: membership.membershipTier,
          stripeSubscriptionId: membership.stripeSubscriptionId
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
        dueDate: payment.scheduledDate,
        status: payment.status,
        enrollmentId: payment.enrollmentId
      })),
      emergencyContacts,
      summary: {
        totalChildren: children.length, // FILTERED children only
        totalEnrollments: filteredEnrollments.length, // FILTERED enrollments only
        totalMemberships: membershipEnrollments.length, // FILTERED memberships only
        totalAmountPaid: CurrencyUtils.toDisplay(totalAmountPaid), // Based on FILTERED payments
        totalAmountDue: CurrencyUtils.toDisplay(totalAmountDue), // Based on FILTERED data
        activeEnrollments: filteredEnrollments.filter(e => ['enrolled', 'pending_payment'].includes(e.status)).length,
        activeMemberships: membershipEnrollments.filter(m => ['active', 'enrolled', 'pending_payment'].includes(m.status)).length
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