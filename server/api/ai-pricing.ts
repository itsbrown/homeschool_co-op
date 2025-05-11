import { Router } from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { isAuthenticated } from "../middleware/auth";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create router
const router = Router();

// Validation schema for the request body
const pricingSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  durationWeeks: z.number().int().positive(),
  sessionsPerWeek: z.number().int().positive(),
  sessionLengthMinutes: z.number().int().positive(),
  gradeLevels: z.array(z.string()),
  location: z.string().optional(),
  instructorName: z.string().optional(),
});

/**
 * POST /api/ai/suggest-price
 * Get AI-suggested pricing for a class
 */
router.post("/suggest-price", isAuthenticated, async (req, res) => {
  try {
    // Validate request body
    const validatedData = pricingSuggestionSchema.parse(req.body);
    
    // Calculate total hours
    const totalSessions = validatedData.durationWeeks * validatedData.sessionsPerWeek;
    const sessionHours = validatedData.sessionLengthMinutes / 60;
    const totalHours = totalSessions * sessionHours;
    
    // Format grade levels for prompt
    const gradeLevelsText = validatedData.gradeLevels.join(", ");
    
    // Construct the prompt for Claude
    const prompt = `You are an expert in educational program pricing. Please suggest an appropriate price for the following class:

Title: ${validatedData.title}
Description: ${validatedData.description}
Category: ${validatedData.category}
Grade Levels: ${gradeLevelsText}
Duration: ${validatedData.durationWeeks} weeks
Sessions: ${validatedData.sessionsPerWeek} per week, ${validatedData.sessionLengthMinutes} minutes each
Total Sessions: ${totalSessions}
Total Hours: ${totalHours.toFixed(1)}
${validatedData.location ? `Location: ${validatedData.location}` : ''}
${validatedData.instructorName ? `Instructor: ${validatedData.instructorName}` : ''}

Based on the information provided, suggest a fair market price for this class. Consider factors like:
1. Class category (academic, arts, sports, etc.)
2. Grade level (younger children's classes may be priced differently)
3. Duration and total hours
4. Specialized content or unique value
5. Current market rates for similar educational programs

Return only a JSON object with a "suggestedPrice" field containing a number representing the suggested price in USD with no currency symbol. For example:
{"suggestedPrice": 150.00}`;

    // Call the Claude API
    // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      system: "You are a pricing consultant for educational programs. Analyze the class details and provide a well-reasoned price suggestion in JSON format with only a suggestedPrice field.",
    });

    // Extract the response
    const content = response.content[0].text;
    
    try {
      // Try to parse the response as JSON
      const jsonMatch = content.match(/\{.*\}/s);
      
      if (jsonMatch) {
        const parsedResponse = JSON.parse(jsonMatch[0]);
        
        if (typeof parsedResponse.suggestedPrice === 'number') {
          return res.json({ suggestedPrice: parsedResponse.suggestedPrice });
        }
      }
      
      // If JSON parsing fails, use a price estimation algorithm as fallback
      const basePrice = calculateBasePriceEstimate(validatedData, totalHours);
      return res.json({ suggestedPrice: basePrice });
      
    } catch (error) {
      console.error("Error parsing Claude response:", error);
      
      // Fallback to algorithmic pricing
      const basePrice = calculateBasePriceEstimate(validatedData, totalHours);
      return res.json({ suggestedPrice: basePrice });
    }
  } catch (error) {
    console.error("AI pricing suggestion error:", error);
    return res.status(400).json({ message: "Failed to generate price suggestion" });
  }
});

/**
 * Fallback function to calculate a base price estimate
 */
function calculateBasePriceEstimate(data: z.infer<typeof pricingSuggestionSchema>, totalHours: number): number {
  // Base rate per hour depending on category
  const categoryRates: Record<string, number> = {
    academic: 15,
    arts: 18,
    music: 22,
    sports: 16,
    stem: 20,
    language: 18,
    coding: 25,
    cooking: 20,
    crafts: 16,
  };
  
  // Default rate if category not found
  const baseHourlyRate = categoryRates[data.category] || 18;
  
  // Adjust for grade level (higher grades = slightly higher price)
  let gradeLevelMultiplier = 1.0;
  const highestGradeIndex = data.gradeLevels.findIndex(level => 
    level.includes("12th") || level.includes("11th") || level.includes("10th") || level.includes("9th")
  );
  
  if (highestGradeIndex !== -1) {
    gradeLevelMultiplier = 1.15; // High school
  } else if (data.gradeLevels.some(level => 
    level.includes("8th") || level.includes("7th") || level.includes("6th")
  )) {
    gradeLevelMultiplier = 1.1; // Middle school
  }
  
  // Session frequency adjustment (more sessions per week = slight discount)
  const frequencyAdjustment = data.sessionsPerWeek > 2 ? 0.95 : 1.0;
  
  // Duration adjustment (longer programs = slight discount)
  const durationAdjustment = data.durationWeeks > 8 ? 0.9 : (data.durationWeeks > 4 ? 0.95 : 1.0);
  
  // Calculate final price
  let finalPrice = baseHourlyRate * totalHours * gradeLevelMultiplier * frequencyAdjustment * durationAdjustment;
  
  // Round to nearest $5
  finalPrice = Math.ceil(finalPrice / 5) * 5;
  
  return finalPrice;
}

export default router;