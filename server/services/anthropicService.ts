import Anthropic from "@anthropic-ai/sdk";

// Types for messages
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Check if Anthropic API key is available
const anthropicApiKeyAvailable = !!process.env.ANTHROPIC_API_KEY;

class AnthropicService {
  private static instance: AnthropicService;
  private available: boolean;
  private status: "operational" | "degraded" | "down";

  private constructor() {
    this.available = anthropicApiKeyAvailable;
    this.status = anthropicApiKeyAvailable ? "operational" : "down";
  }

  public static getInstance(): AnthropicService {
    if (!AnthropicService.instance) {
      AnthropicService.instance = new AnthropicService();
    }
    return AnthropicService.instance;
  }

  /**
   * Get the status of the Anthropic service
   */
  public getStatus() {
    return {
      available: this.available,
      status: this.status
    };
  }

  /**
   * Set the status of the Anthropic service
   */
  public setStatus(status: "operational" | "degraded" | "down") {
    this.status = status;
    this.available = status !== "down";
  }

  /**
   * Convert standard chat messages to Anthropic-specific format
   */
  private convertMessages(messages: ChatMessage[]) {
    const systemMessage = messages.find(msg => msg.role === "system");
    const conversationMessages = messages.filter(msg => msg.role !== "system");
    
    return {
      system: systemMessage?.content || "",
      messages: conversationMessages.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      }))
    };
  }

  /**
   * Generate a chat completion
   */
  public async generateChatCompletion(messages: ChatMessage[], maxTokens = 1000): Promise<string> {
    if (!this.available) {
      throw new Error("Anthropic service is not available");
    }

    try {
      const { system, messages: conversationMessages } = this.convertMessages(messages);
      
      // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        system: system,
        messages: conversationMessages,
        max_tokens: maxTokens,
      });

      const content = (response.content[0] as any).text;
      
      if (!content) {
        throw new Error("Anthropic returned empty response");
      }
      
      return content;
    } catch (error: any) {
      console.error("Anthropic API error:", error);
      
      // Handle rate limiting
      if (error.status === 429) {
        this.setStatus("degraded");
        throw new Error("Anthropic API rate limit exceeded. Please try again later.");
      }
      
      // Handle other errors
      this.setStatus("degraded");
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  /**
   * Generate content with a simple prompt
   */
  public async generateContent(prompt: string, jsonMode = false, maxTokens = 1000): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: jsonMode ? `${prompt}\n\nPlease respond with valid JSON only.` : prompt
      }
    ];
    
    return this.generateChatCompletion(messages, maxTokens);
  }
}

export const anthropicService = AnthropicService.getInstance();

// Helper function to check if Anthropic is available
export function isAnthropicAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Curriculum generation function
export async function generateAICurriculum(params: any): Promise<any> {
  const { subject, gradeLevel, learningStyles, additionalDetails } = params;
  
  const prompt = `Create a comprehensive curriculum for ${subject} at ${gradeLevel} grade level.

Learning Styles to accommodate: ${learningStyles.join(", ")}
${additionalDetails ? `Additional Requirements: ${additionalDetails}` : ""}

Please provide a structured curriculum with the following format:
{
  "title": "Curriculum Title",
  "description": "Brief description of the curriculum",
  "objectives": ["Learning objective 1", "Learning objective 2", "Learning objective 3"],
  "units": [
    {
      "title": "Unit 1 Title",
      "description": "Unit description",
      "lessons": [
        {
          "title": "Lesson Title",
          "description": "Lesson description",
          "duration": 45,
          "activities": ["Activity 1", "Activity 2"],
          "materials": ["Material 1", "Material 2"],
          "assessment": "Assessment method"
        }
      ]
    }
  ]
}

Respond with valid JSON only.`;

  try {
    const response = await anthropicService.generateContent(prompt, true, 2000);
    
    // Clean up the response to fix common JSON issues
    let cleanedResponse = response.trim();
    
    // Remove any markdown code blocks
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Try to find and extract valid JSON by counting braces
    const jsonStart = cleanedResponse.indexOf('{');
    if (jsonStart === -1) {
      throw new Error("No JSON object found in response");
    }
    
    let braceCount = 0;
    let jsonEnd = -1;
    
    for (let i = jsonStart; i < cleanedResponse.length; i++) {
      if (cleanedResponse[i] === '{') {
        braceCount++;
      } else if (cleanedResponse[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }
    
    if (jsonEnd === -1) {
      throw new Error("Incomplete JSON object in response");
    }
    
    cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);
    
    // Fix common JSON issues
    cleanedResponse = cleanedResponse
      .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Quote unquoted keys
      .replace(/:\s*'([^']*)'/g, ': "$1"');  // Replace single quotes with double quotes
    
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("AI curriculum generation failed:", error);
    // Return a basic curriculum structure as fallback
    return {
      title: `${subject} Curriculum for ${gradeLevel}`,
      description: `A comprehensive ${subject} curriculum designed for ${gradeLevel} students incorporating ${learningStyles.join(", ")} learning styles.`,
      objectives: [
        "Develop understanding of core concepts",
        "Build critical thinking skills",
        "Apply knowledge to real-world situations"
      ],
      units: [
        {
          title: "Introduction to " + subject,
          description: "Foundational concepts and principles",
          lessons: [
            {
              title: "Getting Started",
              description: "Introduction to the subject matter",
              duration: 45,
              activities: ["Discussion", "Reading"],
              materials: ["Textbook", "Worksheets"],
              assessment: "Participation and comprehension check"
            }
          ]
        }
      ]
    };
  }
}