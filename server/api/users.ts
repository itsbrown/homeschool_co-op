import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, hasRole } from "./auth";
import bcrypt from "bcryptjs";

const router = Router();

// Get current user profile
router.get("/profile", isAuthenticated, async (req, res) => {
  try {
    const user = await storage.getUser(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Remove sensitive information
    const { password, ...userProfile } = user;
    
    res.status(200).json(userProfile);
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

// Update user profile
router.patch("/profile", isAuthenticated, async (req, res) => {
  try {
    const user = await storage.getUser(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const { username, email, password, name, avatar, subscription } = req.body;
    
    // Update only provided fields
    const updateData: any = {};
    
    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Username is already taken" });
      }
      updateData.username = username;
    }
    
    if (email && email !== user.email) {
      // Check if email is already taken
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Email is already taken" });
      }
      updateData.email = email;
    }
    
    if (password) {
      // Hash new password
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    if (name) {
      updateData.name = name;
    }
    
    if (avatar) {
      updateData.avatar = avatar;
    }
    
    if (subscription && 
        ["free", "individual", "family", "educator", "institutional"].includes(subscription)) {
      updateData.subscription = subscription;
    }
    
    // In a real app, we would have an updateUser method
    // For mock implementation, we'll just return the user with updated fields
    const updatedUser = { ...user, ...updateData };
    
    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;
    
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({ message: "Error updating user profile" });
  }
});

// Admin only: get all users
router.get("/", isAuthenticated, hasRole(["admin"]), async (req, res) => {
  try {
    // In a real app, we would have a getAllUsers method and pagination
    // For now, we'll just return all users from the in-memory store
    
    const users = Array.from(storage.usersStore.values());
    
    // Remove passwords
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.status(200).json(usersWithoutPasswords);
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Admin only: get a specific user
router.get("/:id", isAuthenticated, hasRole(["admin"]), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Remove password
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// Admin only: update user role
router.patch("/:id/role", isAuthenticated, hasRole(["admin"]), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    
    if (!role || !["learner", "parent", "educator", "admin"].includes(role)) {
      return res.status(400).json({ 
        message: "Invalid role. Must be one of: learner, parent, educator, admin" 
      });
    }
    
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // In a real app, we would have an updateUser method
    // For mock implementation, we'll just return the user with updated role
    const updatedUser = { ...user, role };
    
    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;
    
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({ message: "Error updating user role" });
  }
});

export default router;
