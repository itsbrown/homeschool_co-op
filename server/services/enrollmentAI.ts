import { storage } from "../storage";
import { anthropicService } from "./anthropicService";
import { openAIService } from "./openaiService";
import { Program } from "@shared/schema";

// Type definitions
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface EnrollmentAction {
  type: "view_programs" | "enroll" | "view_children" | "recommend";
  programId?: number;
  childId?: number;
  interestArea?: string;
  ageRange?: string;
}

interface AIResponse {
  message: string;
  action?: EnrollmentAction;
}

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an AI enrollment assistant for an educational platform. 
Your goal is to help parents find suitable programs for their children and assist with the enrollment process.

AVAILABLE INFORMATION:
1. The parent's children and their details
2. Available educational programs

TASKS YOU CAN PERFORM:
1. Recommend programs based on a child's age, interests, and learning style
2. Answer questions about programs (schedule, curriculum, cost, etc.)
3. Guide the enrollment process and create enrollment requests
4. Provide information about existing enrollments

CONVERSATION GUIDELINES:
- Be helpful, friendly, and conversational
- Ask clarifying questions if needed
- When recommending programs, explain why they might be a good fit
- If a request cannot be fulfilled, explain why and suggest alternatives
- When enrollment is requested, confirm details before proceeding

RESPONSE FORMAT:
Your responses should be friendly, concise, and focused on helping the parent.
If you need to perform a specific action like enrollment or recommendation, include the action details in a structured format.`;

/**
 * Process a user message and generate an AI response for the enrollment assistant
 */
export async function processEnrollmentMessage(
  message: string,
  childrenIds: number[],
  chatHistory: ChatMessage[]
): Promise<AIResponse> {
  try {
    // Fetch relevant data
    const children = [];
    for (const childId of childrenIds) {
      const child = await storage.getChildById(childId);
      if (child) {
        children.push(child);
      }
    }
    
    // Fetch available programs
    const programs = await storage.getAllPublishedPrograms();
    
    // Format context about available data
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
           Description: ${program.description}
           Age Range: ${program.ageRange || 'All ages'}
           Category: ${program.category || 'General'}
           Instructor: ${program.instructorName}
           Schedule: ${program.schedule || 'Flexible'}
           Location: ${program.location || 'Online'}
           Capacity: ${program.capacity} students
           Enrollment Status: ${program.isEnrollmentOpen ? 'Open' : 'Closed'}`
        ).join('\n\n')}`
      : 'No programs are currently available.';
    
    // Build the complete context
    const fullContext = `${childrenContext}\n\n${programsContext}`;
    
    // Prepare messages for the AI
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCURRENT DATA:\n${fullContext}` },
      ...chatHistory,
      { role: "user", content: message }
    ];
    
    // Try using Anthropic first, fall back to OpenAI if needed
    let aiResponse;
    try {
      aiResponse = await anthropicService.generateChatCompletion(messages);
    } catch (error) {
      console.error("Error with Anthropic service, falling back to OpenAI:", error);
      aiResponse = await openAIService.generateChatCompletion(messages);
    }
    
    // Parse the response to extract potential actions
    const action = parseActionFromResponse(aiResponse);
    
    return {
      message: aiResponse,
      action
    };
    
  } catch (error) {
    console.error("Error processing enrollment message:", error);
    return {
      message: "I'm sorry, I encountered an error processing your request. Please try again later."
    };
  }
}

/**
 * Calculate age from birthdate
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
 * Parse potential actions from the AI response
 */
function parseActionFromResponse(response: string): EnrollmentAction | undefined {
  // Look for action markers in the response
  const enrollPattern = /\[\s*ENROLL\s*:\s*Child\s*ID\s*:\s*(\d+)\s*,\s*Program\s*ID\s*:\s*(\d+)\s*\]/i;
  const recommendPattern = /\[\s*RECOMMEND\s*:\s*(.*?)\s*\]/i;
  const viewChildrenPattern = /\[\s*VIEW_CHILDREN\s*\]/i;
  const viewProgramsPattern = /\[\s*VIEW_PROGRAMS\s*(?::\s*(.*?))?\s*\]/i;
  
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