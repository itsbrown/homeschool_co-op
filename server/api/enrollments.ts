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
router.delete('/:enrollmentId', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`❌ Unenrolling enrollment ID: ${enrollmentId}`);
    
    // Remove the enrollment
    const success = await storage.removeEnrollment(enrollmentId);
    
    if (success) {
      console.log(`✅ Successfully unenrolled enrollment ID: ${enrollmentId}`);
      res.json({ message: 'Unenrollment successful' });
    } else {
      console.log(`❌ Failed to find enrollment ID: ${enrollmentId}`);
      res.status(404).json({ message: 'Enrollment not found' });
    }
  } catch (error) {
    console.error('Error removing enrollment:', error);
    res.status(500).json({ message: 'Failed to unenroll' });
  }
});

export default router;