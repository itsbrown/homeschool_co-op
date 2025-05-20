import { Router } from "express";

const router = Router();

// Special direct login for school admin
router.post("/login", async (req, res) => {
  try {
    console.log('School Admin direct login attempt');
    
    // Create the school admin user
    const schoolAdminUser = {
      id: 5,
      name: 'School Administrator',
      username: 'schooladmin',
      email: 'school@example.com',
      role: 'schoolAdmin',
      avatar: null,
      subscription: 'premium',
      createdAt: new Date()
    };
    
    // Set session data for the school admin
    req.session.userId = schoolAdminUser.id;
    req.session.userRole = schoolAdminUser.role;
    
    // Log session details for debugging
    console.log('School Admin direct login - Session data:', {
      userId: req.session.userId,
      userRole: req.session.userRole
    });
    
    // Force save the session
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session for school admin:', err);
          reject(err);
        } else {
          console.log('School admin session saved successfully');
          resolve();
        }
      });
    });
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: "School Admin login successful",
      user: schoolAdminUser
    });
  } catch (error) {
    console.error('School admin direct login error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error during login"
    });
  }
});

export default router;