
import express from "express";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";

const router = express.Router();

// Get school for authenticated parent (no email parameter required)
router.get("/school", supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.auth?.payload?.email;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Get user by email
    const user = await storage.getUserByEmail(userEmail);

    if (user && user.schoolId) {
      // Fetch school details
      const school = await storage.getSchool(user.schoolId);
      if (school) {
        return res.json({ success: true, school });
      }
    }

    return res.json({ success: false, school: null });
  } catch (error: any) {
    console.error("Error fetching parent's school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create school-parent association
router.post("/associate", async (req, res) => {
  try {
    const { parentEmail, schoolId, registrationCode } = req.body;

    if (!parentEmail || (!schoolId && !registrationCode)) {
      return res.status(400).json({ 
        message: "Parent email and school identifier are required" 
      });
    }

    console.log('🔗 Creating school-parent association:', { parentEmail, schoolId, registrationCode });

    // Get user by email
    const user = await storage.getUserByEmail(parentEmail);
    
    if (!user) {
      return res.status(404).json({ message: "Parent not found" });
    }

    // Update user with school association
    const updatedUser = await storage.updateUser(user.id, {
      schoolId: schoolId ? parseInt(schoolId) : null
    });

    if (updatedUser) {
      console.log('✅ School-parent association created');
      return res.json({ 
        success: true, 
        message: "School association created successfully",
        userId: updatedUser.id,
        schoolId: updatedUser.schoolId
      });
    }

    return res.status(500).json({ message: "Failed to update user" });
  } catch (error: any) {
    console.error("Error creating school-parent association:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get school for parent
router.get("/school/:parentEmail", async (req, res) => {
  try {
    const { parentEmail } = req.params;

    // Get user by email
    const user = await storage.getUserByEmail(parentEmail);

    if (user && user.schoolId) {
      // Fetch school details
      const school = await storage.getSchool(user.schoolId);
      if (school) {
        return res.json({ success: true, school });
      }
    }

    return res.json({ success: false, school: null });
  } catch (error: any) {
    console.error("Error fetching parent's school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
