/**
 * Anthropic AI Service
 * Provides Claude API integration for text generation and analysis
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client with API key from environment variables
let anthropic: Anthropic | null = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('Anthropic API initialized successfully, key available:', !!process.env.ANTHROPIC_API_KEY);
  } else {
    console.warn('Anthropic API Key not provided in environment variables');
  }
} catch (error) {
  console.error('Failed to initialize Anthropic client:', error);
}

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

/**
 * Class for interacting with Anthropic/Claude API
 */
class AnthropicService {
  /**
   * Check if the Anthropic client is available
   * @returns boolean indicating availability
   */
  isAvailable(): boolean {
    return !!anthropic;
  }
  
  /**
   * Generate content using Claude
   * @param prompt The prompt to send to Claude
   * @param returnJson Set to true to request JSON formatted response
   * @param maxTokens Maximum tokens to generate
   * @returns Generated content string or null if error
   */
  async generateContent(prompt: string, returnJson: boolean = false, maxTokens: number = 1024): Promise<string | null> {
    if (!this.isAvailable()) {
      console.warn('Anthropic service unavailable');
      return null;
    }
    
    try {
      const systemPrompt = returnJson 
        ? "You are a helpful assistant. Always respond in valid JSON format."
        : "You are a helpful educational assistant that provides clear, accurate, and age-appropriate content.";
      
      const response = await anthropic!.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      
      if (response.content[0].type === 'text') {
        return response.content[0].text;
      }
      return null;
    } catch (error) {
      console.error('Error generating content with Anthropic:', error);
      return null;
    }
  }
  
  /**
   * Generate curriculum content with Claude
   * @param subject Subject of the curriculum
   * @param gradeLevel Target grade level
   * @param learningStyles Preferred learning styles
   * @param additionalDetails Additional curriculum details
   * @returns Generated curriculum JSON or null if error
   */
  async generateCurriculum(
    subject: string, 
    gradeLevel: string, 
    learningStyles: string[], 
    additionalDetails?: string
  ): Promise<any> {
    const prompt = `
    Create a comprehensive curriculum for a ${gradeLevel} course on ${subject}.
    
    This curriculum should accommodate the following learning styles: ${learningStyles.join(', ')}.
    
    Additional details: ${additionalDetails || 'None provided'}
    
    Format the response as a JSON object with the following structure:
    {
      "title": "Curriculum title",
      "description": "Brief description",
      "duration": "Estimated duration in weeks",
      "objectives": ["learning objective 1", "learning objective 2"],
      "units": [
        {
          "title": "Unit title",
          "description": "Unit description",
          "topics": ["Topic 1", "Topic 2"],
          "activities": ["Activity 1", "Activity 2"]
        }
      ]
    }
    `;
    
    try {
      const response = await this.generateContent(prompt, true, 2048);
      if (!response) return null;
      
      return JSON.parse(response);
    } catch (error) {
      console.error('Error parsing curriculum JSON:', error);
      return null;
    }
  }
  
  /**
   * Summarize a piece of text for educational use
   * @param text Text to summarize
   * @param ageRange Target age range
   * @param maxLength Maximum length in characters
   * @returns Summarized text or null if error
   */
  async summarizeEducationalText(text: string, ageRange: string, maxLength: number = 300): Promise<string | null> {
    const prompt = `
    Summarize the following text for ${ageRange} year old students.
    Make it educational, engaging, and no more than ${maxLength} characters:
    
    ${text}
    `;
    
    return await this.generateContent(prompt, false, 512);
  }
  
  /**
   * Generate educational questions based on content
   * @param content Text content to base questions on
   * @param subject Subject area
   * @param ageRange Target age range
   * @param questionCount Number of questions to generate
   * @returns Array of question objects or null if error
   */
  async generateEducationalQuestions(
    content: string, 
    subject: string, 
    ageRange: string, 
    questionCount: number = 5
  ): Promise<any[] | null> {
    const prompt = `
    Based on the following content about ${subject}, create ${questionCount} educational questions 
    appropriate for ${ageRange} year old students.
    
    Content:
    ${content}
    
    Return the questions in this JSON format:
    [
      {
        "question": "Question text",
        "answer": "Expected answer",
        "type": "multiple_choice OR short_answer OR true_false"
      }
    ]
    `;
    
    try {
      const response = await this.generateContent(prompt, true, 1024);
      if (!response) return null;
      
      return JSON.parse(response);
    } catch (error) {
      console.error('Error parsing questions JSON:', error);
      return null;
    }
  }
}

// Export a singleton instance
export const anthropicService = new AnthropicService();

/**
 * Generate a curriculum plan using Anthropic/Claude
 * @param prompt The curriculum prompt
 * @returns Generated curriculum plan as a JSON string
 */
export async function generateCurriculumWithAI(prompt: string): Promise<string> {
  try {
    const content = await anthropicService.generateContent(prompt, true, 3000);
    return content || "{}";
  } catch (error) {
    console.error("Error generating curriculum with AI:", error);
    throw new Error("Failed to generate curriculum with AI");
  }
}

/**
 * Generate a lesson plan using Anthropic/Claude
 * @param subject The subject area
 * @param gradeLevel The target grade level
 * @param duration Lesson duration in minutes
 * @param topic The lesson topic
 * @param objectives Learning objectives
 * @param learningStyles Learning styles to accommodate
 * @returns Generated lesson plan as a JSON string
 */
export async function generateLessonPlanWithAI(
  subject: string,
  gradeLevel: string,
  duration: number,
  topic: string,
  objectives: string,
  learningStyles: string[]
): Promise<string> {
  try {
    const prompt = `
      Create a detailed lesson plan for a ${duration}-minute lesson on ${topic} for ${gradeLevel} students.
      Subject area: ${subject}
      Learning objectives: ${objectives}
      Learning styles to accommodate: ${learningStyles.join(', ')}
      
      Format your response as a JSON object with this structure:
      {
        "title": "Lesson title",
        "description": "Lesson description",
        "duration": ${duration},
        "objectives": ["objective 1", "objective 2"],
        "materials": ["material 1", "material 2"],
        "activities": [
          {
            "name": "Activity name",
            "description": "Activity description",
            "duration": 10,
            "type": "individual|group|class"
          }
        ],
        "assessment": "Assessment description",
        "differentiation": {
          "visual": "Accommodation for visual learners",
          "auditory": "Accommodation for auditory learners",
          "kinesthetic": "Accommodation for kinesthetic learners"
        }
      }
    `;
    
    const content = await anthropicService.generateContent(prompt, true, 2048);
    return content || "{}";
  } catch (error) {
    console.error("Error generating lesson plan with AI:", error);
    throw new Error("Failed to generate lesson plan with AI");
  }
}

/**
 * Analyze student work and provide feedback using Anthropic/Claude
 * @param studentWork The student's submitted work
 * @param assignment The original assignment description
 * @param gradeLevel The student's grade level
 * @param rubric Optional grading rubric
 * @returns Feedback and assessment as a JSON string
 */
export async function analyzeStudentWork(
  studentWork: string,
  assignment: string,
  gradeLevel: string,
  rubric?: string
): Promise<string> {
  try {
    const prompt = `
      Analyze this student work for a ${gradeLevel} student and provide constructive feedback:
      
      ASSIGNMENT:
      ${assignment}
      
      ${rubric ? `GRADING RUBRIC:\n${rubric}\n\n` : ''}
      
      STUDENT WORK:
      ${studentWork}
      
      Format your response as a JSON object with this structure:
      {
        "strengths": ["strength 1", "strength 2"],
        "areasForImprovement": ["area 1", "area 2"],
        "suggestedNextSteps": ["step 1", "step 2"],
        "overallFeedback": "Overall assessment and feedback",
        "grade": "A|B|C|D|F" (if appropriate based on the rubric)
      }
    `;
    
    const content = await anthropicService.generateContent(prompt, true, 2048);
    return content || "{}";
  } catch (error) {
    console.error("Error analyzing student work with AI:", error);
    throw new Error("Failed to analyze student work with AI");
  }
}

/**
 * Virtual tutor function for answering student questions using Claude
 * @param question The student's question
 * @param subject The subject context
 * @param gradeLevel The student's grade level
 * @param previousExchange Optional previous conversation context
 * @returns Tutor's response
 */
export async function askVirtualTutor(
  question: string,
  subject: string,
  gradeLevel: string,
  previousExchange?: string
): Promise<string> {
  try {
    const prompt = `
      You are acting as a helpful virtual tutor for a ${gradeLevel} student studying ${subject}.
      Please answer their question in a clear, educational, and age-appropriate way.
      
      ${previousExchange ? `Previous conversation:\n${previousExchange}\n\n` : ''}
      
      Student question: ${question}
      
      Provide an answer that helps the student understand the concept rather than just giving them the answer directly.
      Include examples where appropriate and use simple language appropriate for their grade level.
    `;
    
    const response = await anthropicService.generateContent(prompt, false, 1024);
    return response || "I'm sorry, I can't answer that question right now. Please try asking in a different way or ask another question.";
  } catch (error) {
    console.error("Error using virtual tutor with AI:", error);
    return "I apologize, but I'm having trouble processing your question at the moment. Please try again later.";
  }
}

/**
 * Generate enhanced coloring page content with actual images using Anthropic + image generation
 * @param subject The subject for the coloring page
 * @param ageRange The target age range
 * @param elements Array of elements to include
 * @param description Basic description
 * @returns Enhanced activity with image URL
 */
export async function generateColoringPageWithImage(
  subject: string,
  ageRange: string,
  elements: string[],
  description: string
): Promise<any> {
  try {
    // Import image generation service
    const { generateColoringPageImage } = await import('./imageGeneration');
    
    // Generate the actual coloring page image
    const imageResult = await generateColoringPageImage(subject, ageRange, elements);
    
    if (imageResult.success && imageResult.imageUrl) {
      // Return enhanced content with actual image
      return {
        type: 'image-coloring-page',
        theme: `Educational ${subject} Coloring Activity`,
        description: description,
        imageUrl: imageResult.imageUrl,
        base64: imageResult.base64,
        elements: elements,
        learningFacts: [
          `This coloring page features ${elements.join(', ')} related to ${subject}`,
          `Coloring helps develop fine motor skills and creativity`,
          `Each element represents an important aspect of ${subject} learning`
        ]
      };
    } else {
      // Return text-based content if image generation fails
      return {
        type: 'text-coloring-page',
        description: description,
        image: `A coloring page featuring ${elements.join(', ')} related to ${subject}`,
        elements: elements.map(el => ({
          name: el,
          description: `Color the ${el} using your favorite colors`
        }))
      };
    }
  } catch (error) {
    console.error('Error generating coloring page with image:', error);
    // Return basic text content as fallback
    return {
      type: 'text-coloring-page',
      description: description,
      image: `A coloring page featuring ${elements.join(', ')} related to ${subject}`,
      elements: elements.map(el => ({
        name: el,
        description: `Color the ${el} using your favorite colors`
      }))
    };
  }
}

/**
 * Check if Anthropic service is available
 * @returns boolean indicating if Anthropic is available
 */
export function isAnthropicAvailable(): boolean {
  return anthropicService.isAvailable();
}