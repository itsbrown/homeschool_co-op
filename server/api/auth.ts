import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from "../services/emailService";
import { userStorage } from "../users-storage";
const directUserStorage = require('../direct-user-storage');

const router = Router();

// Middleware to check Firebase authentication
// Removing Firebase authentication, so this middleware is no longer needed
// Auth0 authentication is handled by middleware

// Middleware to check role
export const hasRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (req.session.userId && roles.includes(req.session.userRole)) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      parentFirstName, 
      parentLastName, 
      firstName, 
      lastName, 
      phone,
      location,
      role,
      schoolId,
      registrationCode
    } = req.body;

    // Handle both old format (firstName/lastName) and new format (parentFirstName/parentLastName)
    const userFirstName = parentFirstName || firstName;
    const userLastName = parentLastName || lastName;

    if (!email || !userFirstName || !userLastName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, first name, and last name are required' 
      });
    }

    // List of reserved test account emails that cannot be registered
    const reservedEmails = [
      'educator.test@americanseekersacademy.com',
      'admin@example.com',
      'educator@example.com',
      'parent@example.com',
      'learner@example.com',
      'school@example.com'
    ];

    // Check if trying to register a reserved test account email
    if (reservedEmails.includes(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'This email is reserved for testing. Please use a different email address.' 
      });
    }

    // Check if user already exists in database
    try {
      const existingUser = await storage.getUserByEmail?.(email);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'User already exists' 
        });
      }
    } catch (error) {
      // If database lookup fails, continue with registration
      console.log('Database lookup failed during registration check, continuing...');
    }

    // For parent registration, generate a temporary password or use a default
    const userPassword = password || 'tempPassword123';
    const hashedPassword = await bcrypt.hash(userPassword, 10);

    // Create user
    const userData = {
      username: email, // Use email as username
      email,
      password: hashedPassword,
      name: `${userFirstName} ${userLastName}`,
      phone: phone || '',
      role: role || 'parent',
      schoolId: schoolId || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    let user;
    try {
      user = await storage.createUser(userData);
    } catch (createError) {
      console.error('User creation failed:', createError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create user account. Please try again.' 
      });
    }

    // If this is a school-specific registration, associate with school
    if (schoolId && registrationCode) {
      try {
        // Create school-parent association
        await fetch(`${req.protocol}://${req.get('host')}/api/school-parents/associate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentEmail: email,
            schoolId,
            registrationCode
          })
        });
      } catch (associationError) {
        console.warn('Could not create school association:', associationError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Parent account created successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        schoolId: user.schoolId
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    console.log('Login attempt for user:', req.body.email || req.body.username);
    const { username, email, password } = req.body;
    const loginIdentifier = email || username;

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    // Handle test account credentials (including educator email)
    const testAccounts = {
      'educator.test@americanseekersacademy.com': {
        id: 2,
        name: 'Sarah Johnson',
        username: 'educator_test',
        email: 'educator.test@americanseekersacademy.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        firstName: 'Sarah',
        lastName: 'Johnson',
        createdAt: new Date()
      },
      'admin': {
        id: 1,
        name: 'Admin User',
        username: 'admin',
        email: 'admin@example.com', 
        role: 'admin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      },
      'educator': {
        id: 2,
        name: 'Test Educator',
        username: 'educator',
        email: 'educator@example.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        createdAt: new Date()
      },
      'parent': {
        id: 3,
        name: 'Test Parent',
        username: 'parent',
        email: 'parent@example.com',
        role: 'parent',
        avatar: null,
        subscription: 'family',
        createdAt: new Date()
      },
      'learner': {
        id: 4,
        name: 'Test Learner',
        username: 'learner',
        email: 'learner@example.com',
        role: 'learner',
        avatar: null,
        subscription: 'free',
        createdAt: new Date()
      },
      'schooladmin': {
        id: 5,
        name: 'School Administrator',
        username: 'schooladmin',
        email: 'school@example.com',
        role: 'schoolAdmin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      }
    };

    // Check if this is a test account login
    const testAccount = testAccounts[loginIdentifier];
    if (testAccount && password === 'password') {
      console.log(`Test account login successful: ${loginIdentifier}`);

      // Set session data
      req.session.userId = testAccount.id;
      req.session.userRole = testAccount.role;

      // Save session
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            reject(err);
          } else {
            console.log('Session saved successfully');
            resolve();
          }
        });
      });

      return res.status(200).json({
        message: `Login successful (${testAccount.role})`,
        user: testAccount
      });
    }

    // Special case for schooladmin login - the case is important! We need exact match
    if (loginIdentifier === 'schooladmin' && password === 'password') {
      console.log('School Admin login attempt successful');

      // Create hardcoded School Admin user
      const schoolAdminUser = {
        id: 5,
        name: 'School Administrator',
        username: 'schooladmin',
        email: 'school@example.com',
        role: 'schoolAdmin', // Must exactly match what's used in schema.ts
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      };

      // Store user data in session
      req.session.userId = schoolAdminUser.id;
      req.session.userRole = schoolAdminUser.role;

      // Debug session information
      console.log('Session before save:', {
        sessionID: req.sessionID,
        cookie: req.session.cookie,
        userId: req.session.userId,
        userRole: req.session.userRole
      });

      // Force save the session with proper error handling
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

      console.log('Session after save:', {
        sessionID: req.sessionID,
        cookie: req.session.cookie,
        userId: req.session.userId,
        userRole: req.session.userRole
      });

      return res.status(200).json({
        message: "School Admin login successful",
        user: schoolAdminUser
      });
    }

    

    // If we reach this point, it means the user either:
    // 1. Provided incorrect credentials for a test account
    // 2. Is trying to use a database account

    console.log(`Test account login failed, trying database lookup for: ${loginIdentifier}`);

    // Only try database if test accounts don't match
    const user = await storage.getUserByUsername(loginIdentifier) || await storage.getUserByEmail?.(loginIdentifier);
    if (!user) {
      console.log('User not found in database:', loginIdentifier);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Set session data
    req.session.userId = user.id;
    req.session.userRole = user.role;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({ 
      message: "Login successful", 
      user: userWithoutPassword 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Error during login" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Error during logout" });
    }
    res.status(200).json({ message: "Logout successful" });
  });
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    console.log('Session check in /me endpoint:', req.session);
    console.log('Cookies received:', req.headers.cookie);

    // First check if user is authenticated
    if (!req.session || !req.session.userId) {
      console.log('No session or userId found in session');
      return res.status(401).json({ message: "Unauthorized" });
    }

    // HARD-CODED TEST ACCOUNTS - NO DATABASE NEEDED
    console.log('User ID from session:', req.session.userId);

    // Directly check which test account to return based on session ID
    if (req.session.userId === 1) {
      const adminUser = {
        id: 1,
        name: 'Admin User',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        avatar: null,
        subscription: 'premium',
        createdAt: new Date()
      };
      console.log('Returning admin user profile');
      return res.status(200).json(adminUser);
    } 
    else if (req.session.userId === 2) {
      const educatorUser = {
        id: 2,
        name: 'Sarah Johnson',
        username: 'educator_test',
        email: 'educator.test@americanseekersacademy.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
        firstName: 'Sarah',
        lastName: 'Johnson',
        createdAt: new Date()
      };
      console.log('Returning educator user profile');
      return res.status(200).json(educatorUser);
    }
    else if (req.session.userId === 3) {
      const parentUser = {
        id: 3,
        name: 'Test Parent',
        username: 'parent',
        email: 'parent@example.com',
        role: 'parent',
        avatar: null,
        subscription: 'family',
        createdAt: new Date()
      };
      console.log('Returning parent user profile');
      return res.status(200).json(parentUser);
    }
    else if (req.session.userId === 4) {
      const learnerUser = {
        id: 4,
        name: 'Test Learner',
        username: 'learner',
        email: 'learner@example.com',
        role: 'learner',
        avatar: null,
        subscription: 'free',
        createdAt: new Date()
      };
      console.log('Returning learner user profile');
      return res.status(200).json(learnerUser);
    }
    else if (req.session.userId === 5) {
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
      console.log('Returning school admin user profile');
      return res.status(200).json(schoolAdminUser);
    }

    // Try using database for real users
    console.log('Trying to fetch user from database, ID:', req.session.userId);
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Error fetching user data" });
  }
});

// Auth0 authentication is handled by middleware

// Check for role invitation
router.post("/check-invitation", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check for active role invitations
    const invitation = await storage.getActiveRoleInvitation(email);

    if (invitation) {
      return res.status(200).json({ 
        invitation: {
          role: invitation.role,
          schoolId: invitation.schoolId,
          token: invitation.token
        }
      });
    }

    return res.status(200).json({ invitation: null });
  } catch (error) {
    console.error("Check invitation error:", error);
    res.status(500).json({ message: "Error checking invitation" });
  }
});

// Accept role invitation
router.post("/accept-invitation", async (req, res) => {
  try {
    const { token, userEmail } = req.body;

    if (!token || !userEmail) {
      return res.status(400).json({ message: "Token and email are required" });
    }

    const invitation = await storage.acceptRoleInvitation(token, userEmail);

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    return res.status(200).json({ 
      message: "Invitation accepted successfully",
      role: invitation.role,
      schoolId: invitation.schoolId
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

// Store password reset tokens temporarily (in production, use Redis or database)
const passwordResetTokens = new Map();

// Password reset request
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      // Don't reveal if the email exists or not for security
      return res.status(200).json({ 
        message: "If your email is registered, you will receive a password reset link" 
      });
    }

    // Generate a secure reset token
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store the reset token
    passwordResetTokens.set(resetToken, {
      email: user.email,
      userId: user.id,
      expiresAt
    });

    // Clean up expired tokens
    for (const [token, data] of passwordResetTokens.entries()) {
      if (new Date() > data.expiresAt) {
        passwordResetTokens.delete(token);
      }
    }

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

    // Send password reset email - mock for now
    console.log(`[PASSWORD RESET] Email would be sent to: ${email}`);
    console.log(`[PASSWORD RESET] Reset URL: ${resetUrl}`);

    res.status(200).json({ 
      message: "If your email is registered, you will receive a password reset link",
      // For testing purposes, include the token in response (remove in production)
      resetToken: resetToken,
      resetUrl: resetUrl
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Error processing your request" });
  }
});

// Reset password with token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Check if token exists and is valid
    const tokenData = passwordResetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (new Date() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return res.status(400).json({ message: "Reset token has expired" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    try {
      await storage.updateUserPassword(tokenData.userId, hashedPassword);
      
      // Remove the used token
      passwordResetTokens.delete(token);

      res.status(200).json({ 
        message: "Password reset successfully. You can now log in with your new password." 
      });
    } catch (updateError) {
      console.error("Error updating password:", updateError);
      res.status(500).json({ message: "Error updating password" });
    }

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Error resetting password" });
  }
});

// Validate reset token
router.get("/validate-reset-token", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, message: "Token is required" });
    }

    const tokenData = passwordResetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ valid: false, message: "Invalid token" });
    }

    if (new Date() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return res.status(400).json({ valid: false, message: "Token has expired" });
    }

    res.status(200).json({ 
      valid: true, 
      email: tokenData.email 
    });
  } catch (error) {
    console.error("Validate token error:", error);
    res.status(500).json({ valid: false, message: "Error validating token" });
  }
});

export default router;