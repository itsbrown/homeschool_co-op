import { Router } from "express";
import { storage } from '../storage';

const router = Router();

// Get current user profile
router.get("/profile", async (req: any, res) => {
  try {
    // Get user data from the authenticated session
    const authUser = req.user;
    const userEmail = authUser?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    console.log("🔍 Profile API - Email:", userEmail);
    
    // Fetch user from database
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Build profile response from database user
    const userProfile = {
      id: user.id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phoneNumber: user.phone || "",
      avatar: authUser?.user_metadata?.avatar_url || "",
      subscription: "free",
      role: user.role,
      schoolId: user.schoolId || null
    };
    
    console.log("📋 Profile returned:", userProfile);
    
    res.status(200).json(userProfile);
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

// Update user profile
router.patch("/profile", async (req: any, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    
    console.log("Updating profile with:", { firstName, lastName, phoneNumber });
    
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    // Get existing user from database
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Update user in database
    const updatedUser = await storage.updateUser(user.id, {
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      phone: phoneNumber || user.phone
    });
    
    if (!updatedUser) {
      return res.status(500).json({ message: "Failed to update profile" });
    }
    
    // Build profile response
    const updatedProfile = {
      id: updatedUser.id,
      name: `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`.trim() || updatedUser.email,
      email: updatedUser.email,
      firstName: updatedUser.firstName || "",
      lastName: updatedUser.lastName || "",
      phoneNumber: updatedUser.phone || "",
      avatar: req.user?.user_metadata?.avatar_url || "",
      subscription: "free"
    };
    
    console.log("Profile updated successfully:", updatedProfile);
    
    res.status(200).json(updatedProfile);
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({ message: "Error updating user profile" });
  }
});

// Get user role by email
router.get("/role/:email", async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log(`🔍 Role lookup for email: ${email}`);
    
    const user = await storage.getUserByEmail(decodeURIComponent(email));
    
    if (!user) {
      console.log(`❌ User not found for email: ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ Role found for ${email}: ${user.role}`);
    res.json({ role: user.role });
    
  } catch (error) {
    console.error('❌ Error fetching user role:', error);
    res.status(500).json({ error: 'Failed to fetch user role' });
  }
});

export default router;