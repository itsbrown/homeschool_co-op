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

// DELETE enrollment by ID (blocks if totalPaid > 0)
router.delete('/enrollments/:id', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    
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
      return res.status(403).json({ message: 'Only school administrators can delete enrollments' });
    }
    
    console.log(`🗑️  Admin ${userEmail} attempting to delete enrollment ID: ${enrollmentId}`);
    
    // Get enrollment details first for validation and logging
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ message: 'Cannot delete enrollments from other schools' });
    }

    // Block deletion if there are payments - require reallocation first
    const totalPaid = enrollment.totalPaid || 0;
    if (totalPaid > 0) {
      console.log(`⚠️ Cannot delete enrollment ${enrollmentId} - has $${(totalPaid / 100).toFixed(2)} in payments`);
      return res.status(400).json({ 
        message: 'Cannot delete enrollment with existing payments',
        error: 'PAYMENTS_EXIST',
        details: {
          totalPaid: totalPaid,
          totalPaidFormatted: `$${(totalPaid / 100).toFixed(2)}`,
          hint: 'Please reallocate or refund the payments before unenrolling'
        }
      });
    }
    
    console.log(`📝 Deleting: ${enrollment.className} for ${enrollment.childName} (${enrollment.parentEmail})`);
    
    // Delete the enrollment
    await storage.deleteProgramEnrollment(enrollmentId);
    
    console.log(`✅ Successfully deleted enrollment ID ${enrollmentId}`);
    
    res.json({ 
      message: 'Enrollment deleted successfully',
      deletedEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName,
        parentEmail: enrollment.parentEmail
      }
    });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    res.status(500).json({ message: 'Failed to delete enrollment' });
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
