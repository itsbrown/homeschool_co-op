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
  type: "view_programs" | "enroll" | "view_children" | "recommend" | "register_child";
  programId?: number;
  childId?: number;
  interestArea?: string;
  ageRange?: string;
  registrationData?: {
    name: string;
    age: number;
    grade: string;
    phone: string;
    address: string;
    emergency1: string;
    emergency2?: string;
    medical: string;
    caregiver?: string;
  };
}

interface AIResponse {
  message: string;
  action?: EnrollmentAction;
}

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an AI enrollment assistant for American Seekers Academy. 
Your goal is to help parents register their children and find suitable programs.

AVAILABLE INFORMATION:
1. The parent's children and their details
2. Available educational programs

TASKS YOU CAN PERFORM:
1. Help register new children by collecting required information
2. Recommend programs based on a child's age, interests, and learning style
3. Answer questions about programs (schedule, curriculum, cost, etc.)
4. Guide the enrollment process and create enrollment requests
5. Provide information about existing enrollments

CHILD REGISTRATION PROCESS:
When helping register a new child, collect these details in order:
1. Child's first and last name
2. Child's age or birth date
3. Grade level or academic level
4. Parent contact information (phone number)
5. Home address
6. Emergency contacts (at least one)
7. Any medical information or special needs
8. Any additional caregivers

Once you have collected all required information, summarize it and ask for confirmation before proceeding with registration.

REGISTRATION PROCESSING:
1. When a parent provides child information (name, age/grade, interests), immediately process the registration
2. For confirmations like "yes", "confirm", "register" - DO NOT restart conversation, use collected information
3. Use this format: [REGISTER_CHILD: firstName: [first], lastName: [last], birthdate: [date], gradeLevel: [grade], interests: [array], learningStyle: [style]]

CONFIRMATION RESPONSES:
- Never respond to "yes" by asking "What's your child's name?" 
- Always use previously collected information when user confirms
- Process registration immediately when sufficient data is available

CONVERSATION GUIDELINES:
- Be helpful, friendly, and conversational
- Ask clarifying questions if needed
- When recommending programs, explain why they might be a good fit
- If a request cannot be fulfilled, explain why and suggest alternatives
- When collecting registration info, guide parents step by step
- Always confirm details before finalizing registration

RESPONSE FORMAT:
Your responses should be friendly, concise, and focused on helping the parent.
If you need to perform a specific action like registration or enrollment, include the action details in the specified format.`;

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
    
    // Handle confirmation messages to prevent conversation restart
    const isConfirmation = /^(yes|confirm|register|ok|proceed|sure|y)$/i.test(message.trim());
    console.log("🔍 Checking confirmation:", { message: message.trim(), isConfirmation, historyLength: chatHistory.length });
    
    // Force confirmation handling for testing
    if (message.trim().toLowerCase() === "yes") {
      console.log("🔍 FORCE CONFIRMATION DETECTED");
    }
    
    if (isConfirmation && chatHistory.length > 0) {
      const lastAssistantMessage = chatHistory.filter(msg => msg.role === "assistant").pop();
      console.log("🔍 Last assistant message exists:", !!lastAssistantMessage);
      console.log("🔍 Contains registration prompt:", lastAssistantMessage?.content.includes("Should I register"));
      
      if (lastAssistantMessage && lastAssistantMessage.content.includes("Should I register")) {
        console.log("🔍 Confirmation detected, processing registration from context:");
        console.log("📝 Last assistant message:", lastAssistantMessage.content);
        
        // Multiple pattern attempts to extract name
        const namePatterns = [
          /register\s+\*\*([^*]+)\*\*/i,
          /\*\*([A-Za-z]+\s+[A-Za-z]+)\*\*/,
          /register\s+([A-Za-z]+\s+[A-Za-z]+)/i,
          /([A-Za-z]+\s+[A-Za-z]+)\s+at\s+American/i
        ];
        
        let nameMatches = null;
        for (const pattern of namePatterns) {
          nameMatches = lastAssistantMessage.content.match(pattern);
          if (nameMatches) break;
        }
        
        const ageMatches = lastAssistantMessage.content.match(/\*\*Age:\*\*\s*(\d+)/) ||
                          lastAssistantMessage.content.match(/Age:\*\*\s*(\d+)/) ||
                          lastAssistantMessage.content.match(/(\d+)/);
        const gradeMatches = lastAssistantMessage.content.match(/\*\*Grade:\*\*\s*([^*\n]+)/) ||
                            lastAssistantMessage.content.match(/Grade:\*\*\s*([^*\n]+)/);
        
        console.log("🔍 Pattern matches:", { nameMatches, ageMatches, gradeMatches });
        
        if (nameMatches) {
          const fullName = nameMatches[1];
          const nameParts = fullName.split(' ');
          const firstName = nameParts[0] || 'Student';
          const lastName = nameParts.slice(1).join(' ') || 'Student';
          const age = ageMatches ? parseInt(ageMatches[1]) : 8;
          const grade = gradeMatches ? gradeMatches[1].trim() : "3rd Grade";
          
          const currentYear = new Date().getFullYear();
          const birthYear = currentYear - age;
          const birthdate = `${birthYear}-06-15`;
          
          console.log("✅ Extracted registration data:", { firstName, lastName, age, grade, birthdate });
          
          return {
            message: `Perfect! I'm registering ${firstName} ${lastName} right now with the information you provided.`,
            action: {
              type: "register_child",
              registrationData: {
                name: `${firstName} ${lastName}`,
                age: age,
                grade: grade,
                phone: "",
                address: "",
                emergency1: "",
                emergency2: "",
                medical: "",
                caregiver: ""
              }
            }
          };
        } else {
          console.log("❌ No name found in confirmation context, falling back to AI");
        }
      }
    }

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
  const registerPattern = /\[\s*REGISTER_CHILD\s*:\s*\{(.*?)\}\s*\]/i;
  
  // Check for child registration action
  const registerMatch = response.match(registerPattern);
  if (registerMatch) {
    try {
      // Parse the registration data from the match
      const dataString = registerMatch[1];
      const registrationData: any = {};
      
      // Extract key-value pairs from the string
      const pairs = dataString.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split(':').map(s => s.trim());
        if (key && value) {
          const cleanKey = key.replace(/"/g, '');
          const cleanValue = value.replace(/"/g, '');
          registrationData[cleanKey] = cleanValue;
        }
      }
      
      return {
        type: "register_child",
        registrationData: {
          name: registrationData.name || '',
          age: parseInt(registrationData.age) || 0,
          grade: registrationData.grade || '',
          phone: registrationData.phone || '',
          address: registrationData.address || '',
          emergency1: registrationData.emergency1 || '',
          emergency2: registrationData.emergency2 || '',
          medical: registrationData.medical || 'None',
          caregiver: registrationData.caregiver || 'None'
        }
      };
    } catch (error) {
      console.error('Error parsing registration data:', error);
    }
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