import { Router } from "express";
import { isAuthenticated } from "./auth";
import { getAITutorResponse, getSuggestedResources } from "../services/tutorService";

const router = Router();

// Get a response from the AI tutor
router.post("/ask", isAuthenticated, async (req, res) => {
  try {
    const { message, subject, gradeLevel } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }
    
    const response = await getAITutorResponse(message, subject, gradeLevel);
    
    res.status(200).json({ response });
  } catch (error) {
    console.error("Tutor response error:", error);
    res.status(500).json({ message: "Error getting tutor response" });
  }
});

// Get suggested resources for a topic
router.post("/resources", isAuthenticated, async (req, res) => {
  try {
    const { topic, subject, gradeLevel, learningStyle } = req.body;
    
    if (!topic || !subject || !gradeLevel) {
      return res.status(400).json({ 
        message: "Required fields are missing", 
        requiredFields: ["topic", "subject", "gradeLevel"] 
      });
    }
    
    const resources = await getSuggestedResources(topic, subject, gradeLevel, learningStyle);
    
    res.status(200).json({ resources });
  } catch (error) {
    console.error("Resource suggestions error:", error);
    res.status(500).json({ message: "Error getting resource suggestions" });
  }
});

export default router;