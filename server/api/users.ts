import { Router } from "express";
import fs from 'fs';
import path from 'path';

const router = Router();

// File-based storage for user profiles
const PROFILE_FILE = path.join(process.cwd(), 'data', 'user-profiles.json');

// Helper function to read profiles from file
function readProfiles() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const data = fs.readFileSync(PROFILE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading profiles:", error);
  }
  return {};
}

// Helper function to write profiles to file
function writeProfiles(profiles: any) {
  try {
    console.log("Writing profiles to:", PROFILE_FILE);
    // Ensure data directory exists
    const dataDir = path.dirname(PROFILE_FILE);
    console.log("Data directory:", dataDir);
    if (!fs.existsSync(dataDir)) {
      console.log("Creating data directory...");
      fs.mkdirSync(dataDir, { recursive: true });
    }
    console.log("Writing file content:", JSON.stringify(profiles, null, 2));
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles, null, 2));
    console.log("File written successfully");
  } catch (error) {
    console.error("Error writing profiles:", error);
  }
}

// Get current user profile
router.get("/profile", async (req, res) => {
  try {
    const profiles = readProfiles();
    const userEmail = "coreycreates@gmail.com"; // In real app, get from Auth0 token
    
    const userProfile = profiles[userEmail] || {
      id: "1",
      name: "Corey Creates", 
      email: userEmail,
      firstName: "Corey",
      lastName: "Creates",
      phoneNumber: "",
      avatar: "",
      subscription: "free"
    };
    
    res.status(200).json(userProfile);
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
    
    const userEmail = "coreycreates@gmail.com"; // In real app, get from Auth0 token
    const profiles = readProfiles();
    
    // Get existing profile or create new one
    const existingProfile = profiles[userEmail] || {
      id: "1",
      email: userEmail,
      firstName: "Corey",
      lastName: "Creates",
      phoneNumber: "",
      avatar: "",
      subscription: "free"
    };
    
    // Update profile with new data
    const updatedProfile = {
      ...existingProfile,
      firstName: firstName || existingProfile.firstName,
      lastName: lastName || existingProfile.lastName,
      phoneNumber: phoneNumber || existingProfile.phoneNumber,
      name: firstName && lastName ? `${firstName} ${lastName}` : 
            firstName ? firstName : 
            lastName ? lastName : existingProfile.name
    };
    
    // Save to file
    profiles[userEmail] = updatedProfile;
    writeProfiles(profiles);
    
    console.log("Profile updated and saved successfully:", updatedProfile);
    
    res.status(200).json(updatedProfile);
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({ message: "Error updating user profile" });
  }
});

export default router;