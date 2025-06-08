import express from "express";
import { storage } from "../storage";

const router = express.Router();

// Get enrollments for a specific child
router.get('/child/:childId', async (req, res) => {
  try {
    const childId = parseInt(req.params.childId);
    
    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid child ID' });
    }

    console.log(`📚 Fetching enrollments for child ID: ${childId}`);
    
    // Get enrollments for this child
    const enrollments = await storage.getEnrollmentsByChildId(childId);
    
    console.log(`📚 Found ${enrollments.length} enrollments for child ${childId}:`, enrollments);
    
    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching child enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

// Unenroll a child from a class
router.delete('/:enrollmentId', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`❌ Unenrolling enrollment ID: ${enrollmentId}`);

    // Get the enrollment first to verify ownership
    const allEnrollments = await storage.getEnrollmentsByChildId(0); // Get all enrollments
    const enrollmentToRemove = allEnrollments.find((e: any) => e.id === enrollmentId);
    
    if (!enrollmentToRemove) {
      console.log(`❌ Enrollment ${enrollmentId} not found`);
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // For now, allow any authenticated request to remove enrollments
    // In production, you would verify the user is the parent of the child
    console.log(`📝 Found enrollment to remove:`, enrollmentToRemove);
    
    // Remove the enrollment
    const success = await storage.removeEnrollment(enrollmentId);
    
    if (success) {
      console.log(`✅ Successfully unenrolled enrollment ID: ${enrollmentId}`);
      res.json({ message: 'Unenrollment successful' });
    } else {
      console.log(`❌ Failed to remove enrollment ID: ${enrollmentId}`);
      res.status(404).json({ message: 'Enrollment not found' });
    }
  } catch (error) {
    console.error('Error removing enrollment:', error);
    res.status(500).json({ message: 'Failed to unenroll' });
  }
});

export default router;