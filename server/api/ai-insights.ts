import express from "express";
import { storage } from "../storage";
import {
  analyzePaymentPatterns,
  generateEnrollmentRecommendations,
  suggestPaymentPlans,
  predictClassPopularity,
  generatePaymentReminder,
  analyzeStudentEngagement
} from "../lib/ai-insights";

const router = express.Router();

// Analyze payment patterns for a family
router.get('/payment-patterns/:parentEmail', async (req, res) => {
  try {
    const { parentEmail } = req.params;
    
    // Get payment history for the family
    const paymentHistory = await storage.getPaymentsByParentEmail(parentEmail);
    
    if (paymentHistory.length === 0) {
      return res.json({
        success: false,
        message: 'No payment history found for analysis'
      });
    }
    
    const patterns = await analyzePaymentPatterns(paymentHistory);
    
    res.json({
      success: true,
      patterns,
      totalPayments: paymentHistory.length,
      analysisDate: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error analyzing payment patterns:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze payment patterns'
    });
  }
});

// Get enrollment recommendations for a child
router.get('/enrollment-recommendations/:childId', async (req, res) => {
  try {
    const childId = parseInt(req.params.childId);
    
    // Get child profile
    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({
        success: false,
        error: 'Child not found'
      });
    }
    
    // Get available classes
    const availableClasses = await storage.getAllClasses();
    
    // Get child's enrollment history
    const enrollmentHistory = await storage.getEnrollmentsByChildId(childId);
    
    const recommendations = await generateEnrollmentRecommendations(
      child,
      availableClasses,
      enrollmentHistory
    );
    
    res.json({
      success: true,
      recommendations,
      childProfile: {
        id: child.id,
        firstName: child.firstName,
        gradeLevel: child.gradeLevel,
        interests: child.interests,
        learningStyle: child.learningStyle
      }
    });
  } catch (error) {
    console.error('Error generating enrollment recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recommendations'
    });
  }
});

// Get payment plan suggestions for a family
router.post('/payment-plan-suggestions', async (req, res) => {
  try {
    const { parentEmail, enrollmentAmount, childIds } = req.body;
    
    if (!parentEmail || !enrollmentAmount) {
      return res.status(400).json({
        success: false,
        error: 'Parent email and enrollment amount are required'
      });
    }
    
    // Get family's payment history
    const paymentHistory = await storage.getPaymentsByParentEmail(parentEmail);
    
    // Analyze payment patterns to create financial profile
    const paymentPatterns = paymentHistory.length > 0 ? 
      await analyzePaymentPatterns(paymentHistory) : null;
    
    const familyProfile = {
      paymentHistory: paymentHistory.slice(-10), // Last 10 payments
      patterns: paymentPatterns,
      childCount: childIds?.length || 1
    };
    
    const suggestions = await suggestPaymentPlans(
      familyProfile,
      enrollmentAmount,
      paymentHistory
    );
    
    res.json({
      success: true,
      suggestions,
      familyProfile: {
        totalPreviousPayments: paymentHistory.length,
        averagePayment: paymentPatterns?.averageAmount || 0,
        riskScore: paymentPatterns?.riskScore || 50
      }
    });
  } catch (error) {
    console.error('Error generating payment plan suggestions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate payment plan suggestions'
    });
  }
});

// Predict class popularity and enrollment trends
router.get('/class-popularity-predictions', async (req, res) => {
  try {
    // Get historical enrollment data
    const historicalEnrollments = await storage.getAllEnrollments();
    
    // Get current class details
    const classDetails = await storage.getAllClasses();
    
    // Get seasonal trends (simplified - could be enhanced with more data)
    const seasonalTrends = {
      currentMonth: new Date().getMonth() + 1,
      enrollmentsByMonth: historicalEnrollments.reduce((acc: any, enrollment: any) => {
        const month = new Date(enrollment.enrollmentDate).getMonth() + 1;
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {})
    };
    
    const predictions = await predictClassPopularity(
      historicalEnrollments,
      classDetails,
      seasonalTrends
    );
    
    res.json({
      success: true,
      predictions,
      dataPoints: {
        totalHistoricalEnrollments: historicalEnrollments.length,
        totalClasses: classDetails.length,
        analysisDate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error predicting class popularity:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to predict class popularity'
    });
  }
});

// Generate personalized payment reminder
router.post('/payment-reminder', async (req, res) => {
  try {
    const {
      parentEmail,
      childName,
      amountDue,
      dueDate,
      parentName
    } = req.body;
    
    if (!parentEmail || !childName || !amountDue || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required for payment reminder generation'
      });
    }
    
    // Get payment history for personalization
    const paymentHistory = await storage.getPaymentsByParentEmail(parentEmail);
    
    // Generate personalized reminder
    const reminderMessage = await generatePaymentReminder(
      parentName || 'Parent',
      childName,
      amountDue,
      dueDate,
      paymentHistory
    );
    
    res.json({
      success: true,
      reminderMessage,
      personalizationData: {
        hasPaymentHistory: paymentHistory.length > 0,
        totalPreviousPayments: paymentHistory.length,
        lastPaymentDate: paymentHistory[0]?.createdAt
      }
    });
  } catch (error) {
    console.error('Error generating payment reminder:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate payment reminder'
    });
  }
});

// Analyze student engagement
router.get('/student-engagement/:studentId', async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    
    // Get student data
    const student = await storage.getChildById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    // Get enrollment/class data as proxy for attendance
    const enrollments = await storage.getEnrollmentsByChildId(studentId);
    
    // Simulate parent feedback (in real implementation, this would come from feedback system)
    const parentFeedback = []; // Placeholder - implement feedback collection system
    
    const engagement = await analyzeStudentEngagement(
      student,
      enrollments,
      parentFeedback
    );
    
    res.json({
      success: true,
      engagement,
      studentInfo: {
        id: student.id,
        firstName: student.firstName,
        gradeLevel: student.gradeLevel,
        totalEnrollments: enrollments.length
      }
    });
  } catch (error) {
    console.error('Error analyzing student engagement:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze student engagement'
    });
  }
});

// Get comprehensive family insights
router.get('/family-insights/:parentEmail', async (req, res) => {
  try {
    const { parentEmail } = req.params;
    
    // Get family data
    const children = await storage.getChildrenByParentEmail(parentEmail);
    const paymentHistory = await storage.getPaymentsByParentEmail(parentEmail);
    
    if (children.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No children found for this parent'
      });
    }
    
    // Analyze payment patterns
    const paymentPatterns = paymentHistory.length > 0 ? 
      await analyzePaymentPatterns(paymentHistory) : null;
    
    // Get enrollment recommendations for each child
    const availableClasses = await storage.getAllClasses();
    const childInsights = await Promise.all(
      children.map(async (child) => {
        const enrollmentHistory = await storage.getEnrollmentsByChildId(child.id);
        const recommendations = await generateEnrollmentRecommendations(
          child,
          availableClasses,
          enrollmentHistory
        );
        
        return {
          child: {
            id: child.id,
            firstName: child.firstName,
            gradeLevel: child.gradeLevel,
            interests: child.interests
          },
          recommendations: recommendations.slice(0, 3), // Top 3 recommendations
          currentEnrollments: enrollmentHistory.length
        };
      })
    );
    
    res.json({
      success: true,
      familyInsights: {
        paymentPatterns,
        childInsights,
        totalChildren: children.length,
        totalPayments: paymentHistory.length,
        analysisDate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error generating family insights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate family insights'
    });
  }
});

export default router;