import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET enrollment details by ID
router.get('/enrollments/:id', async (req, res) => {
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
router.delete('/enrollments/:id', async (req: any, res) => {
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

    // Verify user is a school admin
    const user = await storage.getUserByEmail(userEmail);
    if (!user || user.role !== 'schoolAdmin') {
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

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
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

// GET enrollments by parent email (for investigation)
router.get('/enrollments/parent/:email', async (req, res) => {
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
