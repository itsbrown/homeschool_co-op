import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";
import { sendWelcomeEmail, sendVerificationEmail } from "../services/emailService";
import { userStorage } from "../users-storage";

const router = Router();

// Middleware to check authentication
export const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Middleware to check role
export const hasRole = (roles: string[]) => {
  return (req, res, next) => {
    if (req.session.userId && roles.includes(req.session.userRole)) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };
};

// Register a new user
router.post("/register", async (req, res) => {
  try {
    const validatedData = insertUserSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await storage.getUserByUsername(validatedData.username);
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }
    
    const existingEmail = await storage.getUserByEmail(validatedData.email);
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    // Create user
    const user = await storage.createUser({
      ...validatedData,
      password: hashedPassword
    });
    
    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    
    // Send welcome and verification emails
    try {
      await sendWelcomeEmail(user.email, user.name);
      
      // In a real app, generate a token and store it
      const verificationToken = Math.random().toString(36).substring(2, 15);
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error("Error sending emails:", emailError);
      // Continue with registration even if emails fail
    }
    
    res.status(201).json({ 
      message: "User created successfully", 
      user: userWithoutPassword 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Error creating user" });
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
    
    // First, try to find the user in our file-based storage
    const user = userStorage.getUserByUsername(username);
    
    if (user) {
      console.log(`Found user in file storage: ${username}`);
      // For test accounts, just check if password is 'password'
      const isPasswordValid = password === 'password';
      
      if (isPasswordValid) {
        console.log(`Login successful for ${username} with role ${user.role}`);
        
        // Set session data
        req.session.userId = user.id;
        req.session.userRole = user.role;
        
        // Save session
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              reject(err);
            } else {
              console.log(`Session saved successfully for user ${username}`);
              resolve();
            }
          });
        });
        
        // Return user data without password
        const { password, ...userWithoutPassword } = user;
        return res.status(200).json({
          message: "Login successful",
          user: userWithoutPassword
        });
      }
    }
    
    // For backward compatibility, also check hardcoded test accounts
    // HARDCODED TEST ACCOUNTS - NO DATABASE NEEDED
    if (password === 'password' && 
       (username === 'admin' || 
        username === 'educator' || 
        username === 'parent' || 
        username === 'learner' ||
        username === 'schooladmin')) {
        
      console.log(`Login attempt with hardcoded test account: ${username}`);
      
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
      } else if (username === 'schooladmin') {
        userData = {
          id: 5,
          name: 'School Administrator',
          username: 'schooladmin',
          email: 'school@example.com',
          role: 'schoolAdmin',
          avatar: null,
          subscription: 'premium',
          createdAt: new Date()
        };
      }
      
      // Set session data
      console.log('Setting session data for user:', userData);
      req.session.userId = userData.id;
      req.session.userRole = userData.role;

      // Save session data immediately
      try {
        await new Promise((resolve, reject) => {
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
    try {
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
    
    // Special case for School Admin
    if (req.session.userId === 5) {
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
    try {
      console.log('Trying to fetch user from database, ID:', req.session.userId);
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.status(200).json(userWithoutPassword);
    } catch (dbError) {
      console.error("Database error fetching user:", dbError);
      return res.status(500).json({ message: "Error fetching user data from database" });
    }
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
    
    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      console.error("Error sending password reset email:", emailError);
      // Continue response even if email fails
    }
    
    res.status(200).json({ 
      message: "If your email is registered, you will receive a password reset link" 
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Error processing your request" });
  }
});

export default router;
