import { storage } from "../storage";
import { anthropicService } from "./anthropicService";
import { openAIService } from "./openaiService";
import { Program } from "@shared/schema";
import { conversationHistory } from "./conversationHistory";

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

MEMORY AND CONTEXT:
- You have access to the parent's previously registered children
- You can see conversation history from previous interactions
- When a parent mentions a child by name, check if they're already registered
- If a child is already registered, use their existing information for recommendations

AVAILABLE INFORMATION:
1. The parent's children and their details (both registered and those mentioned in conversation)
2. Available educational programs
3. Previous conversation history

TASKS YOU CAN PERFORM:
1. Help register new children by collecting required information
2. Recommend programs based on a child's age, interests, and learning style
3. Answer questions about programs (schedule, curriculum, cost, etc.)
4. Guide the enrollment process and create enrollment requests
5. Provide information about existing enrollments
6. Remember previously discussed children and their details

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
1. NEVER automatically register a child based on initial information - always collect full details first
2. Only register after explicitly asking for confirmation and receiving a clear "yes" response
3. Collect ALL required information before offering to register: name, age/grade, phone, address, emergency contacts, medical info
4. Use this format only after confirmation: [REGISTER_CHILD: firstName: [first], lastName: [last], birthdate: [date], gradeLevel: [grade], interests: [array], learningStyle: [style]]

CONFIRMATION RESPONSES:
- Never respond to "yes" by asking "What's your child's name?" 
- Always use previously collected information when user confirms
- Only process registration after collecting complete information AND receiving explicit confirmation

IMPORTANT: When you have enough information to register a child, ALWAYS include the registration action in your response. The system will automatically process the registration when it sees the action format.

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
  chatHistory: ChatMessage[],
  parentEmail?: string
): Promise<AIResponse> {
  try {
    // Fetch relevant data - if no specific children IDs, get all parent's children
    let children = [];
    
    if (childrenIds.length > 0) {
      for (const childId of childrenIds) {
        const child = await storage.getChildById(childId);
        if (child) {
          children.push(child);
        }
      }
    } else if (parentEmail) {
      // Get all children for this parent to provide context
      try {
        const allChildren = await storage.getChildrenByParentEmail(parentEmail);
        children = allChildren || [];
        console.log(`🔍 Found ${children.length} children for parent ${parentEmail}`);
      } catch (error) {
        console.error('Error fetching parent children:', error);
        children = [];
      }
    }
    
    // Fetch available classes/programs - get all classes and filter for published ones
    const allClasses = await storage.getClasses({ page: 1, limit: 100, status: "" });
    const programs = allClasses.filter(c => c.isPublished === true || c.status === "published");
    
    // Format context about available data
    const childrenContext = children.length > 0
      ? `CHILDREN INFORMATION (Already Registered):\n${children.map(child => 
          `Child ID: ${child.id}
           Name: ${child.firstName} ${child.lastName}
           Age: ${calculateAge(child.birthdate)}
           Grade: ${child.gradeLevel}
           Learning Style: ${child.learningStyle || 'Not specified'}
           Interests: ${child.interests?.join(', ') || 'Not specified'}
           Special Needs: ${child.specialNeeds || 'None'}
           Status: Already registered and available for enrollment`
        ).join('\n\n')}`
      : 'No children are currently registered for this parent.';
      
    const programsContext = programs.length > 0
      ? `AVAILABLE PROGRAMS:\n${programs.map(program => 
          `Program ID: ${program.id}
           Title: ${program.title}
           Description: ${program.description}
           Age Range: ${program.ageRange || 'All ages'}
           Grade Level: ${program.gradeLevel || 'All grades'}
           Category: ${program.category || 'General'}
           Instructor: ${program.instructorName || 'TBD'}
           Schedule: ${program.schedule || 'Flexible'}
           Location: ${program.location || 'Online'}
           Capacity: ${program.capacity} students
           Price: $${(program.price / 100).toFixed(2)}
           Start Date: ${program.startDate || 'TBD'}
           End Date: ${program.endDate || 'TBD'}
           Status: ${program.status || (program.isPublished ? 'Open' : 'Closed')}`
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
            message: `Perfect! I'll register ${firstName} ${lastName} with the information you provided. One moment please...`,
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

    // Get conversation history for context
    const previousMessages = parentEmail ? conversationHistory.getHistory(parentEmail) : [];
    const mentionedChildren = parentEmail ? conversationHistory.getMentionedChildren(parentEmail) : [];
    
    // Build conversation context
    const conversationContext = previousMessages.length > 0
      ? `PREVIOUS CONVERSATION CONTEXT:\n${previousMessages.slice(-6).map(msg => 
          `${msg.role.toUpperCase()}: ${msg.content}`
        ).join('\n')}\n\n`
      : '';
    
    const mentionedChildrenContext = mentionedChildren.length > 0
      ? `CHILDREN MENTIONED IN CONVERSATION:\n${mentionedChildren.map(child =>
          `Name: ${child.name}${child.childId ? ` (ID: ${child.childId})` : ''}${child.details ? ` - ${JSON.stringify(child.details)}` : ''}`
        ).join('\n')}\n\n`
      : '';

    // Build the complete context
    const fullContext = `${conversationContext}${mentionedChildrenContext}${childrenContext}\n\n${programsContext}`;
    
    // Prepare messages for the AI
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCURRENT DATA:\n${fullContext}` },
      ...chatHistory,
      { role: "user", content: message }
    ];
    
    // Store user message in conversation history
    if (parentEmail) {
      conversationHistory.addMessage(parentEmail, "user", message);
    }

    // Try using Anthropic first, fall back to OpenAI if needed
    let aiResponse;
    try {
      aiResponse = await anthropicService.generateChatCompletion(messages);
    } catch (error) {
      console.error("Error with Anthropic service, falling back to OpenAI:", error);
      aiResponse = await openAIService.generateChatCompletion(messages);
    }

    // Store AI response in conversation history
    if (parentEmail) {
      conversationHistory.addMessage(parentEmail, "assistant", aiResponse);
    }
    
    // Parse the response to extract potential actions
    console.log('🔍 AI Response for parsing:', aiResponse);
    let action = parseActionFromResponse(aiResponse);
    console.log('🔍 Parsed action:', action);
    
    // Only auto-register if the AI explicitly provides a registration pattern
    // Do not auto-register based on message detection to avoid premature registration
    
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
  const enrollPattern = /\[\s*ENROLL(?:_CHILD|_STUDENT)?\s*:\s*(?:Child\s*ID|childId|Student\s*ID|studentId)\s*:\s*(\d+)\s*,\s*(?:Program\s*ID|programId)\s*:\s*(\d+).*?\]/i;
  const recommendPattern = /\[\s*RECOMMEND\s*:\s*(.*?)\s*\]/i;
  const viewChildrenPattern = /\[\s*VIEW_CHILDREN\s*\]/i;
  const viewProgramsPattern = /\[\s*VIEW_PROGRAMS\s*(?::\s*(.*?))?\s*\]/i;
  const registerPattern = /\[\s*REGISTER_CHILD\s*:\s*(.*?)\s*\]/i;
  
  // Check for child registration action - only process if explicitly formatted
  const registerMatch = response.match(registerPattern);
  if (registerMatch) {
    try {
      console.log("🎯 Found explicit registration pattern:", registerMatch[1]);
      
      // Parse the registration data from the match
      const dataString = registerMatch[1];
      const registrationData: any = {};
      
      // Handle both formats: with and without curly braces
      const cleanDataString = dataString.replace(/^\{|\}$/g, '');
      
      // Extract key-value pairs from the string
      const pairs = cleanDataString.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split(':').map(s => s.trim());
        if (key && value) {
          const cleanKey = key.replace(/"/g, '');
          const cleanValue = value.replace(/"/g, '').replace(/\[|\]/g, '');
          registrationData[cleanKey] = cleanValue;
        }
      }
      
      console.log("🎯 Parsed registration data:", registrationData);
      
      // Only proceed if we have minimum required data
      if (!registrationData.firstName || !registrationData.lastName) {
        console.log("❌ Insufficient registration data, skipping action");
        return undefined;
      }
      
      // Create the name from firstName and lastName if available
      const name = `${registrationData.firstName} ${registrationData.lastName}`;
      
      // Convert birthdate text to actual age
      let age = 0;
      if (registrationData.birthdate && registrationData.birthdate.includes('years old')) {
        const ageMatch = registrationData.birthdate.match(/(\d+)\s*years?\s*old/);
        if (ageMatch) {
          age = parseInt(ageMatch[1]);
        }
      } else if (registrationData.age) {
        age = parseInt(registrationData.age);
      }
      
      const grade = registrationData.gradeLevel || registrationData.grade || '';
      
      return {
        type: "register_child",
        registrationData: {
          name: name,
          age: age,
          grade: grade,
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