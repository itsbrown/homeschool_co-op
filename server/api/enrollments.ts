import express from "express";
import { storage } from "../storage";

const router = express.Router();

// Get enrollments for a specific child
router.get('/child/:childId', async (req, res) => {
  try {
    // Handle special case for "register" route
    if (req.params.childId === 'register') {
      console.log('📚 Register route accessed - returning empty enrollments');
      return res.json([]);
    }
    
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

// Unenroll endpoint - specifically for pending_payment enrollments
router.delete('/:enrollmentId/unenroll', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`📝 UNENROLLMENT REQUEST: Enrollment ${enrollmentId}`);

    // Get the enrollment to verify it exists and check status
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Only allow unenrollment if payment is pending (not yet paid)
    if (enrollment.status !== 'pending_payment') {
      return res.status(400).json({ 
        message: 'Cannot unenroll from a class that has already been paid for' 
      });
    }

    // Delete the enrollment
    await storage.deleteProgramEnrollment(enrollmentId);

    console.log(`✅ Successfully unenrolled from class: ${enrollment.className}`);
    
    res.json({ 
      message: 'Unenrollment successful',
      enrollmentId: enrollmentId
    });
  } catch (error) {
    console.error('Error unenrolling from class:', error);
    res.status(500).json({ message: 'Failed to unenroll from class' });
  }
});

// Unenroll a child from a class (legacy endpoint)
router.delete('/:enrollmentId', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    console.log(`❌ Unenrolling enrollment ID: ${enrollmentId}`);

    // Get the enrollment first to verify ownership
    const allEnrollments = await storage.getAllEnrollments();
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

// Get enrollments for a specific class
router.get('/class/:classId', async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    
    if (isNaN(classId)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }

    console.log(`📚 Fetching enrollments for class ID: ${classId}`);
    
    // Get all enrollments and filter by class ID
    const allEnrollments = await storage.getAllEnrollments();
    const classEnrollments = allEnrollments.filter((e: any) => 
      e.programId === classId || e.classId === classId
    );
    
    console.log(`📚 Found ${classEnrollments.length} enrollments for class ${classId}`);
    
    res.json(classEnrollments);
  } catch (error) {
    console.error('Error fetching class enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

export default router;