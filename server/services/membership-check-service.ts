import { storage } from '../storage.js';

export class MembershipCheckService {
  /**
   * Check if a parent has a valid, paid membership for a school
   */
  static async checkMembershipStatus(parentUserId: number, schoolId: number): Promise<{
    isValid: boolean;
    membership: any | null;
    school: any | null;
    reason?: string;
    requiresPayment: boolean;
    amount?: number;
  }> {
    try {
      // Get school configuration
      const school = await storage.getSchool(schoolId);
      if (!school) {
        return {
          isValid: false,
          membership: null,
          school: null,
          reason: 'School not found',
          requiresPayment: false
        };
      }

      // Check if school requires membership
      if (!school.membershipRequired) {
        return {
          isValid: true,
          membership: null,
          school,
          requiresPayment: false
        };
      }

      // Check if school has membership fees configured
      if (!school.membershipFeeAmount || school.membershipFeeAmount <= 0) {
        return {
          isValid: true,
          membership: null,
          school,
          requiresPayment: false
        };
      }

      // Get current membership for this parent and school
      const currentYear = new Date().getFullYear();
      const membership = await storage.getMembershipEnrollmentByParentAndSchoolAndYear(
        parentUserId,
        schoolId,
        currentYear
      );

      // If no membership enrollment exists, they need to pay
      if (!membership) {
        return {
          isValid: false,
          membership: null,
          school,
          reason: 'No membership enrollment found',
          requiresPayment: true,
          amount: school.membershipFeeAmount
        };
      }

      // Check membership status and expiration
      const now = new Date();
      const expirationDate = new Date(membership.expirationDate);
      const gracePeriodEnd = membership.gracePeriodEnd ? new Date(membership.gracePeriodEnd) : expirationDate;

      // Check if membership is expired (past grace period)
      if (now > gracePeriodEnd) {
        return {
          isValid: false,
          membership,
          school,
          reason: 'Membership expired',
          requiresPayment: true,
          amount: membership.remainingBalance || school.membershipFeeAmount
        };
      }

      // Check if membership is fully paid
      if (membership.status === 'active' || membership.remainingBalance <= 0) {
        return {
          isValid: true,
          membership,
          school,
          requiresPayment: false
        };
      }

      // Membership exists but not fully paid - check if in grace period
      if (now <= gracePeriodEnd) {
        return {
          isValid: true, // Allow enrollment during grace period
          membership,
          school,
          reason: 'In grace period - payment due soon',
          requiresPayment: true,
          amount: membership.remainingBalance
        };
      }

      // Default: membership payment required
      return {
        isValid: false,
        membership,
        school,
        reason: 'Membership payment required',
        requiresPayment: true,
        amount: membership.remainingBalance
      };

    } catch (error) {
      console.error('Error checking membership status:', error);
      return {
        isValid: false,
        membership: null,
        school: null,
        reason: 'Error checking membership status',
        requiresPayment: false
      };
    }
  }

  /**
   * Get unpaid membership for inclusion in cart
   */
  static async getUnpaidMembership(parentUserId: number, schoolId: number): Promise<any | null> {
    try {
      const check = await this.checkMembershipStatus(parentUserId, schoolId);
      
      if (!check.requiresPayment || !check.amount) {
        return null;
      }

      const currentYear = new Date().getFullYear();
      let membership = check.membership;

      // If no membership exists, create one
      if (!membership && check.school) {
        membership = await storage.createOrUpdateMembershipEnrollment(
          parentUserId,
          schoolId,
          currentYear
        );
      }

      if (!membership) {
        return null;
      }

      return {
        id: membership.id,
        amount: check.amount,
        remainingBalance: membership.remainingBalance,
        amountPaid: membership.amountPaid,
        status: membership.status,
        expirationDate: membership.expirationDate,
        membershipYear: membership.membershipYear,
        schoolId: membership.schoolId,
        schoolName: check.school?.name || 'School'
      };

    } catch (error) {
      console.error('Error getting unpaid membership:', error);
      return null;
    }
  }

  /**
   * Block enrollment if membership is not valid (not in grace period)
   */
  static async validateMembershipForEnrollment(parentUserId: number, schoolId: number): Promise<{
    allowed: boolean;
    reason?: string;
    membership?: any;
  }> {
    const check = await this.checkMembershipStatus(parentUserId, schoolId);

    // Allow enrollment if:
    // 1. Membership not required
    // 2. Membership is valid (paid or in grace period)
    if (check.isValid) {
      return { allowed: true, membership: check.membership };
    }

    // Block if expired and past grace period
    if (check.reason === 'Membership expired') {
      return {
        allowed: false,
        reason: 'Your membership has expired. Please renew before enrolling in programs.',
        membership: check.membership
      };
    }

    // Block if no membership and payment required
    if (check.requiresPayment && !check.membership) {
      return {
        allowed: false,
        reason: 'School membership required. Membership fee will be added to your cart.',
        membership: check.membership
      };
    }

    // Default: allow but warn about payment
    return {
      allowed: true,
      reason: check.reason,
      membership: check.membership
    };
  }
}
