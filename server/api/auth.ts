import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from "../services/emailService";
import { userStorage } from "../users-storage";
const directUserStorage = require('../direct-user-storage');

const router = Router();

// Middleware to check authentication
export const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Middleware to check role
export const hasRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (req.session.userId && roles.includes(req.session.userRole)) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };
};

// Register a new user (simplified approach)
router.post("/register", async (req, res) => {
  try {
    console.log("Registration attempt with data:", req.body);
    
    // Validate required fields
    if (!req.body.email || !req.body.password || !req.body.name) {
      return res.status(400).json({ message: "Email, password, and name are required" });
    }
    
    // Use email as username for convenience
    const userData = {
      username: req.body.email,
      email: req.body.email,
      password: req.body.password,
      name: req.body.name,
      role: req.body.role || "parent",
      subscription: req.body.subscription || "free",
      avatar: null
    };
    
    console.log("Preparing user data with email:", userData.email);
    
    // Hash the password
    console.log("Hashing password...");
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      userData.password = hashedPassword;
      console.log("Password hashed successfully");
    } catch (hashError) {
      console.error("Failed to hash password:", hashError);
      return res.status(500).json({ message: "Error during registration process" });
    }
    
    // Use our direct file storage approach
    try {
      console.log("Calling direct user storage");
      const user = directUserStorage.createNewUser(userData);
      console.log("User successfully created with ID:", user.id);
      
      // Create a sanitized version for the response
      const userWithoutPassword = { ...user };
      delete userWithoutPassword.password;
      
      // Set up session
      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session:", err);
        } else {
          console.log("Session saved successfully");
        }
      });
      
      // Send welcome email
      try {
        sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        console.log("Email sending failed, but continuing:", emailError);
      }
      
      return res.status(201).json({
        message: "User registered successfully",
        user: userWithoutPassword
      });
    } catch (storageError) {
      console.error("Storage error during registration:", storageError);
      return res.status(500).json({ 
        message: "Registration failed", 
        error: storageError.message || "Unknown error" 
      });
    }
  } catch (error) {
    console.error("Unexpected registration error:", error);
    return res.status(500).json({ 
      message: "Error creating user"
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    console.log('Login attempt for user:', req.body.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    // Special case for schooladmin login - the case is important! We need exact match
    if (username === 'schooladmin' && password === 'password') {
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
    
    // Handle other test accounts
    if (password === 'password' && 
       (username === 'admin' || 
        username === 'educator' || 
        username === 'parent' || 
        username === 'learner')) {
        
      console.log(`Login attempt with test account: ${username}`);
      
      let userData;
      if (username === 'admin') {
        userData = {
          id: 1,
          name: 'Admin User',
          username: 'admin',
          email: 'admin@example.com', 
          role: 'admin',
          avatar: null,
          subscription: 'premium',
          createdAt: new Date()
        };
      } else if (username === 'educator') {
        userData = {
          id: 2,
          name: 'Test Educator',
          username: 'educator',
          email: 'educator@example.com',
          role: 'educator',
          avatar: null,
          subscription: 'educator',
          createdAt: new Date()
        };
      } else if (username === 'parent') {
        userData = {
          id: 3,
          name: 'Test Parent',
          username: 'parent',
          email: 'parent@example.com',
          role: 'parent',
          avatar: null,
          subscription: 'family',
          createdAt: new Date()
        };
      } else if (username === 'learner') {
        userData = {
          id: 4,
          name: 'Test Learner',
          username: 'learner',
          email: 'learner@example.com',
          role: 'learner',
          avatar: null,
          subscription: 'free',
          createdAt: new Date()
        };
      }
      
      // Set session data
      console.log('Setting session data for user:', userData);
      req.session.userId = userData.id;
      req.session.userRole = userData.role;

      // Save session data immediately
      try {
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              reject(err);
            } else {
              console.log('Session saved successfully');
              resolve();
            }
          });
        });
      } catch (sessionError) {
        console.error('Error saving session:', sessionError);
      }
      
      console.log('Session after save:', req.session);
      
      return res.status(200).json({
        message: `Login successful (test ${userData.role})`,
        user: userData
      });
    }
    
    // If we reach this point, it means the user either:
    // 1. Provided incorrect credentials for a test account
    // 2. Is trying to use a database account
    
    console.log(`Test account login failed, trying database lookup for: ${username}`);
    
    // Only try database if test accounts don't match
    const user = await storage.getUserByUsername(username);
    if (!user) {
      console.log('User not found in database:', username);
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
        name: 'Test Educator',
        username: 'educator',
        email: 'educator@example.com',
        role: 'educator',
        avatar: null,
        subscription: 'educator',
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
    
    // In a real app, generate a token and store it with an expiration
    const resetToken = Math.random().toString(36).substring(2, 15);
    
    // Send password reset email - using our mock service
    console.log(`[MOCK EMAIL] Password reset email would be sent to: ${email}`);
    console.log(`[MOCK EMAIL] Reset token: ${resetToken}`);
    
    res.status(200).json({ 
      message: "If your email is registered, you will receive a password reset link" 
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Error processing your request" });
  }
});

export default router;
