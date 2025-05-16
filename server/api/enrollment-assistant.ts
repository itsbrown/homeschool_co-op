import { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { formatZodError } from "../utils";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Initialize AI service clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Input validation schema
const messageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  childrenIds: z.array(z.number()).optional(),
  history: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional()
});

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an AI enrollment assistant for an educational platform. 
Your goal is to help parents find suitable programs for their children and assist with the enrollment and registration process.

AVAILABLE INFORMATION:
1. The parent's children and their details
2. Available educational programs

TASKS YOU CAN PERFORM:
1. Register new children in the system
2. Recommend programs based on a child's age, interests, and learning style
3. Answer questions about programs (schedule, curriculum, cost, etc.)
4. Guide the enrollment process and create enrollment requests
5. Provide information about existing enrollments

CONVERSATION GUIDELINES:
- Be helpful, friendly, and conversational
- Ask clarifying questions if needed
- When recommending programs, explain why they might be a good fit
- If a request cannot be fulfilled, explain why and suggest alternatives
- When enrollment is requested, confirm details before proceeding
- When registering a child, ask for all necessary information if not provided

RESPONSE FORMAT:
Your responses should be friendly, concise, and focused on helping the parent.
If you need to perform a specific action like enrollment or recommendation, include the action details in a structured format.

ACTIONS:
- To register a new child: [REGISTER_CHILD: firstName: John, lastName: Doe, birthdate: 2015-05-15, gradeLevel: 4, interests: science,math, learningStyle: visual]
- To enroll a child in a program: [ENROLL: Child ID: 123, Program ID: 456]
- To recommend programs: [RECOMMEND: science, art]
- To view children: [VIEW_CHILDREN]
- To view programs (optionally filtered): [VIEW_PROGRAMS] or [VIEW_PROGRAMS: science]`;

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
export const processEnrollmentMessage = async (req: Request, res: Response) => {
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
    
    // Check authentication
    if (!req.session.userId) {
      return res.status(401).json({ message: "You need to be logged in to use the enrollment assistant" });
    }
    
    // Get data for context
    const children = [];
    for (const childId of childrenIds) {
      const child = await storage.getChildById(childId);
      if (child) {
        children.push(child);
      }
    }
    
    // Get available programs
    const programs = await storage.getPublishedPrograms();
    
    // Format context
    const childrenContext = children.length > 0
      ? `CHILDREN INFORMATION:\n${children.map(child => 
          `Child ID: ${child.id}
           Name: ${child.firstName} ${child.lastName}
           Age: ${calculateAge(child.birthdate)}
           Grade: ${child.gradeLevel}
           Learning Style: ${child.learningStyle || 'Not specified'}
           Interests: ${child.interests?.join(', ') || 'Not specified'}
           Special Needs: ${child.specialNeeds || 'None'}`
        ).join('\n\n')}`
      : 'No children are registered for this parent.';
      
    const programsContext = programs.length > 0
      ? `AVAILABLE PROGRAMS:\n${programs.map(program => 
          `Program ID: ${program.id}
           Title: ${program.title}
           Description: ${program.description || 'No description provided'}
           Age Range: ${program.ageRange || 'All ages'}
           Category: ${program.category || 'General'}
           Start Date: ${program.startDate ? new Date(program.startDate).toLocaleDateString() : 'Not specified'}
           End Date: ${program.endDate ? new Date(program.endDate).toLocaleDateString() : 'Not specified'}
           Price: $${program.price || 0}
           Max Capacity: ${program.maxCapacity || 'Unlimited'} students
           Enrollment Status: ${program.isPublished ? 'Open' : 'Closed'}`
        ).join('\n\n')}`
      : 'No programs are currently available.';
    
    // Full context for the AI
    const fullContext = `${childrenContext}\n\n${programsContext}`;
    
    // Prepare messages for the AI
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCURRENT DATA:\n${fullContext}` },
      ...history,
      { role: "user", content: message }
    ];
    
    let aiResponse = "";
    
    // Try Anthropic first (Claude), fall back to OpenAI if needed
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219", // the newest Anthropic model
        system: messages[0].content,
        messages: messages.slice(1).map(msg => ({
          role: msg.role === "system" ? "user" : msg.role,
          content: msg.content
        })),
        max_tokens: 1000,
      });
      
      aiResponse = response.content[0].text;
    } catch (error) {
      console.error("Error with Anthropic API, falling back to OpenAI:", error);
      
      // Fall back to OpenAI
      const openaiResponse = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: 1000,
      });
      
      aiResponse = openaiResponse.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    }
    
    // Parse potential actions from the AI response
    const action = parseActionFromResponse(aiResponse);
    
    // Process actions that require database operations
    let processedAction = action;
    
    if (action && action.type === "register_child") {
      try {
        // Get the parent user
        const user = await storage.getUser(req.session.userId);
        
        if (!user || user.role !== "parent") {
          return res.status(403).json({ 
            message: "Only parents can register children",
            aiResponse
          });
        }
        
        // Format the child data for registration
        const childData = {
          firstName: action.firstName,
          lastName: action.lastName,
          birthdate: action.birthdate,
          gradeLevel: action.gradeLevel,
          parentId: user.id,
          interests: action.interests,
          learningStyle: action.learningStyle || null,
          specialNeeds: action.specialNeeds || null,
          // These can be updated later
          school: null,
          allergies: null,
          medicalInfo: null,
          profileImage: null
        };
        
        // Create the child in the database
        const newChild = await storage.createChild(childData);
        
        // Update the action with the new child ID
        processedAction = {
          ...action,
          childId: newChild.id,
          success: true
        };
      } catch (error) {
        console.error("Error registering child:", error);
        processedAction = {
          ...action,
          success: false,
          error: "Failed to register child in the database"
        };
      }
    }
    
    // Return response
    return res.json({
      message: aiResponse,
      action: processedAction
    });
    
  } catch (error) {
    console.error("Error processing enrollment message:", error);
    return res.status(500).json({ message: "Error processing your request" });
  }
};

/**
 * Parse potential actions from the AI response
 */
function parseActionFromResponse(response: string): any {
  // Look for action markers in the response
  const enrollPattern = /\[\s*ENROLL\s*:\s*Child\s*ID\s*:\s*(\d+)\s*,\s*Program\s*ID\s*:\s*(\d+)\s*\]/i;
  const recommendPattern = /\[\s*RECOMMEND\s*:\s*(.*?)\s*\]/i;
  const viewChildrenPattern = /\[\s*VIEW_CHILDREN\s*\]/i;
  const viewProgramsPattern = /\[\s*VIEW_PROGRAMS\s*(?::\s*(.*?))?\s*\]/i;
  const registerChildPattern = /\[\s*REGISTER_CHILD\s*:\s*firstName\s*:\s*(.*?)\s*,\s*lastName\s*:\s*(.*?)\s*,\s*birthdate\s*:\s*([\d-]+)\s*,\s*gradeLevel\s*:\s*(\d+|[a-zA-Z]+)\s*(?:,\s*interests\s*:\s*(.*?))?\s*(?:,\s*learningStyle\s*:\s*(.*?))?\s*(?:,\s*specialNeeds\s*:\s*(.*?))?\s*\]/i;
  
  // Check for child registration action
  const registerChildMatch = response.match(registerChildPattern);
  if (registerChildMatch) {
    // Parse interests if provided
    const interestsStr = registerChildMatch[5] || '';
    const interests = interestsStr.split(',').map(i => i.trim()).filter(i => i);

    // Parse grade level - could be a number or string
    let gradeLevel = registerChildMatch[4];
    // Try to convert to number if it's numeric
    if (/^\d+$/.test(gradeLevel)) {
      gradeLevel = parseInt(gradeLevel).toString();
    }
    
    return {
      type: "register_child",
      firstName: registerChildMatch[1],
      lastName: registerChildMatch[2],
      birthdate: registerChildMatch[3],
      gradeLevel: gradeLevel,
      interests: interests,
      learningStyle: registerChildMatch[6] || 'not specified',
      specialNeeds: registerChildMatch[7] || ''
    };
  }
  
  // Check for enrollment action
  const enrollMatch = response.match(enrollPattern);
  if (enrollMatch) {
    return {
      type: "enroll",
      childId: parseInt(enrollMatch[1]),
      programId: parseInt(enrollMatch[2])
    };
  }
  
  // Check for recommend action
  const recommendMatch = response.match(recommendPattern);
  if (recommendMatch) {
    return {
      type: "recommend",
      interestArea: recommendMatch[1]
    };
  }
  
  // Check for view children action
  if (viewChildrenPattern.test(response)) {
    return { type: "view_children" };
  }
  
  // Check for view programs action
  const viewProgramsMatch = response.match(viewProgramsPattern);
  if (viewProgramsMatch) {
    return {
      type: "view_programs",
      interestArea: viewProgramsMatch[1]
    };
  }
  
  return undefined;
}