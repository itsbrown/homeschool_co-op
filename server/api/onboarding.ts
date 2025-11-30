import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';

const router = Router();

// Get onboarding tour status for the current user
router.get('/status', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        success: false, 
        error: 'User email not found' 
      });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Get school info to check if tour is enabled
    let tourEnabled = true;
    if (user.schoolId) {
      const school = await storage.getSchool(user.schoolId);
      if (school) {
        tourEnabled = school.onboardingTourEnabled !== false;
      }
    }
    
    res.json({
      success: true,
      hasCompletedOnboarding: user.hasCompletedOnboarding || false,
      tourEnabled,
      shouldShowTour: tourEnabled && !user.hasCompletedOnboarding
    });
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get onboarding status' 
    });
  }
});

// Mark onboarding tour as completed
router.post('/complete', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        success: false, 
        error: 'User email not found' 
      });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    await storage.updateUser(user.id, { 
      hasCompletedOnboarding: true 
    });
    
    res.json({
      success: true,
      message: 'Onboarding tour completed'
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete onboarding' 
    });
  }
});

// Reset onboarding tour (restart tour)
router.post('/reset', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        success: false, 
        error: 'User email not found' 
      });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    await storage.updateUser(user.id, { 
      hasCompletedOnboarding: false 
    });
    
    res.json({
      success: true,
      message: 'Onboarding tour reset - will show again on next dashboard visit'
    });
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset onboarding' 
    });
  }
});

// School admin: Update tour enabled status
router.patch('/school-setting', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: 'enabled must be a boolean' 
      });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Check if user is a school admin
    if (user.role !== 'schoolAdmin' && user.role !== 'admin' && user.role !== 'superAdmin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Only school admins can update this setting' 
      });
    }
    
    if (!user.schoolId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User is not associated with a school' 
      });
    }
    
    await storage.updateSchool(user.schoolId, { 
      onboardingTourEnabled: enabled 
    });
    
    res.json({
      success: true,
      message: `Onboarding tour ${enabled ? 'enabled' : 'disabled'} for school`,
      onboardingTourEnabled: enabled
    });
  } catch (error) {
    console.error('Error updating school onboarding setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update school setting' 
    });
  }
});

// Get school's onboarding tour setting (for admin)
router.get('/school-setting', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (!user.schoolId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User is not associated with a school' 
      });
    }
    
    const school = await storage.getSchool(user.schoolId);
    if (!school) {
      return res.status(404).json({ 
        success: false, 
        error: 'School not found' 
      });
    }
    
    res.json({
      success: true,
      onboardingTourEnabled: school.onboardingTourEnabled !== false
    });
  } catch (error) {
    console.error('Error getting school onboarding setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get school setting' 
    });
  }
});

export default router;
