import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET enrollment details by ID
router.get('/:id', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }
    
    res.json(enrollment);
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({ message: 'Failed to fetch enrollment' });
  }
});

// DELETE enrollment by ID (soft-delete: sets status to 'cancelled')
// Preserves enrollment record for payment history and audit trail
router.delete('/:id', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    const { reason } = req.body || {};
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    // MULTI-ROLE CHECK: Check both user_roles table (new system) and users.role (legacy)
    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can unenroll students' });
    }
    
    console.log(`🗑️  Admin ${userEmail} attempting to cancel enrollment ID: ${enrollmentId}`);
    
    // Get enrollment details first for validation and logging
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Check if already cancelled
    if (enrollment.status === 'cancelled' || enrollment.status === 'withdrawn') {
      return res.status(400).json({ message: 'Enrollment is already cancelled or withdrawn' });
    }

    // Verify enrollment belongs to admin's school (check user_roles school context for multi-role users)
    const schoolAdminRole = userRoles.find(r => r.role === 'schoolAdmin');
    const effectiveSchoolId = schoolAdminRole?.schoolId || user.schoolId;
    if (!hasAdminRole && enrollment.schoolId !== effectiveSchoolId) {
      return res.status(403).json({ message: 'Cannot unenroll students from other schools' });
    }

    const totalPaid = enrollment.totalPaid || 0;
    
    console.log(`📝 Cancelling enrollment: ${enrollment.className} for ${enrollment.childName} (${enrollment.parentEmail})`);
    if (totalPaid > 0) {
      console.log(`💰 Note: Enrollment has $${(totalPaid / 100).toFixed(2)} in payments - preserved for reallocation`);
    }
    
    // Soft-delete: Update status to cancelled instead of deleting
    await storage.updateProgramEnrollment(enrollmentId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: user.id,
      cancellationReason: reason || 'Unenrolled by school administrator',
    });
    
    console.log(`✅ Successfully cancelled enrollment ID ${enrollmentId}`);
    
    res.json({ 
      message: 'Student unenrolled successfully',
      cancelledEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName,
        parentEmail: enrollment.parentEmail,
        status: 'cancelled',
        totalPaid: totalPaid,
        totalPaidFormatted: totalPaid > 0 ? `$${(totalPaid / 100).toFixed(2)}` : '$0.00',
        canReallocatePayments: totalPaid > 0,
      }
    });
  } catch (error) {
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({ message: 'Failed to unenroll student' });
  }
});

// POST comp enrollment - apply percentage-based discount and activate enrollment
router.post('/:id/comp', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    const { compPercentage, compReason } = req.body;
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    // Validate percentage
    const percentage = parseInt(compPercentage);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      return res.status(400).json({ message: 'Comp percentage must be between 1 and 100' });
    }
    
    // Get authenticated user
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    // MULTI-ROLE CHECK: Check both user_roles table (new system) and users.role (legacy)
    const compUserRoles = await storage.getUserRolesByUserId(user.id);
    const hasCompSchoolAdminRole = compUserRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasCompAdminRole = compUserRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasCompSchoolAdminRole && !hasCompAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can comp enrollments' });
    }
    
    console.log(`🎁 Admin ${userEmail} attempting to comp enrollment ID: ${enrollmentId} at ${percentage}%`);
    
    // Get enrollment details
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Verify enrollment belongs to admin's school (check user_roles school context for multi-role users)
    const compSchoolAdminRole = compUserRoles.find(r => r.role === 'schoolAdmin');
    const compEffectiveSchoolId = compSchoolAdminRole?.schoolId || user.schoolId;
    if (!hasCompAdminRole && enrollment.schoolId !== compEffectiveSchoolId) {
      return res.status(403).json({ message: 'Cannot comp enrollments from other schools' });
    }

    // Check enrollment status - only allow comping pending_payment enrollments
    if (enrollment.status !== 'pending_payment') {
      return res.status(400).json({ 
        message: `Can only comp enrollments with 'pending_payment' status. Current status: ${enrollment.status}` 
      });
    }

    // Check if already comped
    if (enrollment.compPercentage && enrollment.compPercentage > 0) {
      return res.status(400).json({ 
        message: `Enrollment already has a ${enrollment.compPercentage}% comp applied` 
      });
    }

    // Calculate comp amount (based on total cost)
    const totalCost = enrollment.totalCost || 0;
    const compAmountCents = Math.round((totalCost * percentage) / 100);
    
    // Calculate new remaining balance after comp
    const currentPaid = enrollment.totalPaid || 0;
    const newRemainingBalance = Math.max(0, totalCost - compAmountCents - currentPaid);
    
    // Determine new status and payment status
    const isFullyComped = newRemainingBalance === 0;
    const newStatus = isFullyComped ? 'enrolled' : enrollment.status;
    const newPaymentStatus = isFullyComped ? 'completed' : enrollment.paymentStatus;
    
    console.log(`📝 Comping enrollment: ${enrollment.className} for ${enrollment.childName}`);
    console.log(`   Total cost: $${(totalCost / 100).toFixed(2)}`);
    console.log(`   Comp percentage: ${percentage}%`);
    console.log(`   Comp amount: $${(compAmountCents / 100).toFixed(2)}`);
    console.log(`   New remaining balance: $${(newRemainingBalance / 100).toFixed(2)}`);
    
    // Update enrollment with comp details
    await storage.updateProgramEnrollment(enrollmentId, {
      compPercentage: percentage,
      compAmountCents: compAmountCents,
      compReason: compReason || 'Comped by school administrator',
      compBy: user.id,
      compAt: new Date(),
      remainingBalance: newRemainingBalance,
      status: newStatus,
      paymentStatus: newPaymentStatus,
    });
    
    console.log(`✅ Successfully comped enrollment ID ${enrollmentId}`);
    
    res.json({ 
      success: true,
      message: isFullyComped 
        ? `Enrollment fully comped - student is now enrolled` 
        : `${percentage}% comp applied - remaining balance: $${(newRemainingBalance / 100).toFixed(2)}`,
      compedEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName,
        parentEmail: enrollment.parentEmail,
        compPercentage: percentage,
        compAmount: compAmountCents,
        compAmountFormatted: `$${(compAmountCents / 100).toFixed(2)}`,
        remainingBalance: newRemainingBalance,
        remainingBalanceFormatted: `$${(newRemainingBalance / 100).toFixed(2)}`,
        status: newStatus,
        paymentStatus: newPaymentStatus,
        isFullyComped: isFullyComped,
      }
    });
  } catch (error) {
    console.error('Error comping enrollment:', error);
    res.status(500).json({ message: 'Failed to comp enrollment' });
  }
});

// GET enrollments by parent email (for investigation)
router.get('/parent/:email', async (req, res) => {
  try {
    const parentEmail = decodeURIComponent(req.params.email);
    
    console.log(`🔍 Admin searching enrollments for: ${parentEmail}`);
    
    const allEnrollments = await storage.getAllEnrollments();
    const parentEnrollments = allEnrollments.filter((e: any) => 
      e.parentEmail === parentEmail
    );
    
    console.log(`📊 Found ${parentEnrollments.length} enrollments for ${parentEmail}`);
    
    res.json(parentEnrollments);
  } catch (error) {
    console.error('Error fetching enrollments by parent:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

export default router;
