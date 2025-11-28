import { storage } from '../storage';

export class MembershipService {
  /**
   * Creates or ensures membership enrollment for a parent at a school for the current year
   */
  static async ensureMembershipEnrollment(parentUserId: number, schoolId: number): Promise<void> {
    const currentYear = new Date().getFullYear();
    
    try {
      // Check if membership enrollment already exists for this year
      const existingMembership = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
        parentUserId, 
        schoolId, 
        currentYear
      );

      if (existingMembership) {
        console.log(`🏅 Membership enrollment already exists for parent ${parentUserId} at school ${schoolId} for ${currentYear}`);
        return;
      }

      // Get school to check if membership fees are configured
      const school = await storage.getSchool(schoolId);
      if (!school) {
        console.error(`❌ School ${schoolId} not found for membership enrollment`);
        return;
      }

      // Only create membership if school has membership fees configured
      if (!school.membershipFeeAmount || school.membershipFeeAmount <= 0) {
        console.log(`ℹ️ School ${schoolId} has no membership fees configured, skipping enrollment`);
        return;
      }

      // Create membership enrollment
      await storage.createOrUpdateMembershipEnrollment(parentUserId, schoolId, currentYear);
      console.log(`✅ Created membership enrollment for parent ${parentUserId} at school ${schoolId} for ${currentYear}`);

    } catch (error) {
      console.error(`❌ Error ensuring membership enrollment:`, error);
      throw error;
    }
  }

  /**
   * Creates membership enrollments for all parents at a school (useful when enabling membership for existing school)
   */
  static async createMembershipEnrollmentsForSchool(schoolId: number): Promise<void> {
    try {
      // Get all children at this school
      const schoolStudents = await storage.getSchoolStudentsBySchoolId(schoolId);
      const childIds = schoolStudents.map(ss => ss.childId);
      
      if (childIds.length === 0) {
        console.log(`ℹ️ No students found at school ${schoolId} for membership enrollment`);
        return;
      }

      // Get all children and their parent emails
      const parentEmailsSet = new Set<string>();
      for (const childId of childIds) {
        const child = await storage.getChildById(childId);
        if (child && child.parentEmail) {
          parentEmailsSet.add(child.parentEmail);
        }
      }

      // Get parent user records
      const allUsers = await storage.getAllUsers();
      const parentUsers = allUsers.filter(user => 
        user.role === 'parent' && parentEmailsSet.has(user.email)
      );

      console.log(`🏅 Creating membership enrollments for ${parentUsers.length} parents at school ${schoolId}`);

      // Create membership enrollments for each parent
      for (const parent of parentUsers) {
        try {
          await this.ensureMembershipEnrollment(parent.id, schoolId);
        } catch (error) {
          console.error(`❌ Error creating membership for parent ${parent.id}:`, error);
        }
      }

      console.log(`✅ Completed membership enrollment process for school ${schoolId}`);

    } catch (error) {
      console.error(`❌ Error creating membership enrollments for school ${schoolId}:`, error);
      throw error;
    }
  }

  /**
   * Updates membership status based on payment status
   */
  static async updateMembershipStatus(membershipId: number, totalPaid: number): Promise<void> {
    try {
      const membership = await storage.getMembershipEnrollmentById(membershipId);
      if (!membership) {
        console.error(`❌ Membership enrollment ${membershipId} not found`);
        return;
      }

      let newStatus = membership.status;
      const remainingBalance = membership.amount - totalPaid;

      if (remainingBalance <= 0) {
        newStatus = 'enrolled'; // Fully paid
      } else {
        // Partial payment or no payment - check expiration status
        // Check if expired or in grace period
        const now = new Date();
        const gracePeriodEnd = membership.gracePeriodEnd ? new Date(membership.gracePeriodEnd) : null;
        const expirationDate = membership.expirationDate ? new Date(membership.expirationDate) : null;
        
        if (gracePeriodEnd && now > gracePeriodEnd) {
          newStatus = 'expired';
        } else if (expirationDate && now > expirationDate) {
          newStatus = 'grace_period';
        } else {
          newStatus = 'pending_payment';
        }
      }

      // Always update amountPaid and remainingBalance to track payment progress
      // Status changes only when fully paid or expiration conditions are met
      const hasChanges = newStatus !== membership.status || 
                         totalPaid !== membership.amountPaid || 
                         remainingBalance !== membership.remainingBalance;
      
      if (hasChanges) {
        await storage.updateMembershipEnrollment(membershipId, {
          status: newStatus,
          amountPaid: totalPaid,
          remainingBalance: remainingBalance
        });
        
        console.log(`✅ Updated membership ${membershipId}: status=${newStatus}, paid=${totalPaid}, balance=${remainingBalance}`);
      }

    } catch (error) {
      console.error(`❌ Error updating membership status:`, error);
      throw error;
    }
  }
}