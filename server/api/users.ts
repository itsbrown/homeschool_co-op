import { Router } from "express";

const router = Router();

// Simple profile endpoints for the frontend form
// Get current user profile (returns Auth0 user info)
router.get("/profile", async (req, res) => {
  try {
    // For now, return basic user info from Auth0
    // In a real implementation, you would fetch additional profile data from a database
    const mockProfile = {
      id: "1",
      name: "Corey Creates", 
      email: "coreycreates@gmail.com",
      firstName: "Corey",
      lastName: "Creates",
      phoneNumber: "",
      avatar: "",
      subscription: "free"
    };
    
    res.status(200).json(mockProfile);
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

// Update user profile
router.patch("/profile", async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    
    console.log("Updating profile with:", { firstName, lastName, phoneNumber });
    
    // For demonstration, we'll simulate saving the data and return success
    // In a real implementation, you would save this to a database
    const updatedProfile = {
      id: "1",
      name: firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "Corey Creates",
      email: "coreycreates@gmail.com",
      firstName: firstName || "Corey",
      lastName: lastName || "Creates", 
      phoneNumber: phoneNumber || "",
      avatar: "",
      subscription: "free"
    };
    
    console.log("Profile updated successfully:", updatedProfile);
    
    res.status(200).json(updatedProfile);
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({ message: "Error updating user profile" });
  }
});

export default router;