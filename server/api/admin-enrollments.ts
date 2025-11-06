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

// DELETE enrollment by ID
router.delete('/enrollments/:id', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    console.log(`🗑️  Admin deleting enrollment ID: ${enrollmentId}`);
    
    // Get enrollment details first for logging
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
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
