import { Request, Response } from "express";
import { z } from "zod";
import { formatZodError } from "../utils";
import { processEnrollmentMessage } from "../services/enrollmentAI";

// Input validation schema
const messageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  childrenIds: z.array(z.number()).optional(),
  history: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional()
});

/**
 * Calculate age from birthdate string
 */
function calculateAge(birthdate: string): number {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Process a request from the enrollment assistant
 */
export const handleEnrollmentMessage = async (req: Request, res: Response) => {
  try {
    // Validate input
    const parseResult = messageSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: formatZodError(parseResult.error)
      });
    }
    
    const { message, childrenIds = [], history = [] } = parseResult.data;
    
    console.log('🔧 DEBUG - API Route received:', { message, childrenIds, historyLength: history.length });
    
    // Check authentication - require at least email or user ID
    if (!req.auth?.email && !req.auth?.userId && !req.auth?.supabaseId) {
      console.log('❌ Authentication failed - req.auth:', req.auth);
      return res.status(401).json({ message: "You need to be logged in to use the enrollment assistant" });
    }

    // Use the service function that contains confirmation handling logic
    const response = await processEnrollmentMessage(
      message,
      childrenIds,
      history
    );
    
    return res.json(response);
  } catch (error) {
    console.error('Enrollment assistant error:', error);
    return res.status(500).json({ 
      message: "Something went wrong with the enrollment assistant. Please try again." 
    });
  }
};

/**
 * Parse potential actions from the AI response
 */
function parseActionFromResponse(response: string): any {
  // This function is kept for compatibility but the main logic is now in the service
  return null;
}