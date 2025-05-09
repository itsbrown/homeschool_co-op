import Anthropic from '@anthropic-ai/sdk';
import { AIGenerationFormData } from '@/lib/types';
import { CurriculumTemplate } from './curriculumService';
import { generateCurriculumWithAI, generateLessonPlanWithAI, analyzeStudentWork } from './anthropic';
import { extractKnowledgeBaseContent, extractKeyConceptsFromKnowledgeBases } from './knowledgeBaseExtraction';

// Import new AI enhancement modules (commented out until fully integrated)
// import { enhanceCurriculumGeneration } from '../../ai/src/curriculum-enhancer';

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
 * Utility function to check if the Anthropic client is available
 * Used by the AI status API and other components
 */
export function isAnthropicAvailable(): boolean {
  return anthropic !== null && !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Generates a curriculum template using Claude AI
 */
export async function generateAICurriculum(formData: AIGenerationFormData): Promise<CurriculumTemplate> {
  try {
    const { subject, gradeLevel, learningStyles, additionalDetails, knowledgeBaseIds } = formData;
    
    // Try using our enhanced curriculumWithAI function first
    try {
      console.log(`Attempting to generate AI curriculum using enhanced service for ${subject} at ${gradeLevel} level...`);
      
      // If knowledge base IDs are provided, fetch their content to integrate
      let knowledgeBaseContent = "";
      if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
        try {
          // Import storage dynamically to avoid circular dependencies
          const { storage } = await import('../storage');
          
          console.log(`Fetching knowledge bases with IDs: ${knowledgeBaseIds.join(', ')}`);
          
          // Fetch knowledge bases
          const knowledgeBases = await Promise.all(
            knowledgeBaseIds.map(id => storage.getKnowledgeBase(id))
          );
          
          // Extract metadata and content from knowledge bases using our utility
          const validKnowledgeBases = knowledgeBases.filter(kb => kb !== undefined);
          
          if (validKnowledgeBases.length > 0) {
            // Use our knowledge base extraction utility
            knowledgeBaseContent = extractKnowledgeBaseContent(validKnowledgeBases);
            
            // Also extract key concepts for improved context
            const keyConcepts = extractKeyConceptsFromKnowledgeBases(validKnowledgeBases);
            
            // Log the extracted concepts for debugging
            console.log('Extracted key concepts from knowledge bases:', {
              topics: keyConcepts.topics,
              keyTerms: keyConcepts.keyTerms,
              mainIdeas: keyConcepts.mainIdeas.length
            });
          }
        } catch (kbError) {
          console.warn("Error fetching knowledge base content:", kbError);
          // Continue with generation even if knowledge base fetch fails
        }
      }
      
      // Build a comprehensive prompt for the curriculum generation
      // Retrieve any extracted key concepts to enhance the prompt if we have valid knowledge bases
      let keyConcepts = { topics: [], keyTerms: [], mainIdeas: [] };
      try {
        // If knowledge base IDs are provided, extract key concepts
        if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
          // Import storage dynamically to avoid circular dependencies
          const { storage } = await import('../storage');
          
          // Fetch knowledge bases
          const knowledgeBases = await Promise.all(
            knowledgeBaseIds.map(id => storage.getKnowledgeBase(id))
          );
          
          // Extract metadata and content from knowledge bases using our utility
          const validKnowledgeBases = knowledgeBases.filter(kb => kb !== undefined);
          
          if (validKnowledgeBases.length > 0) {
            // Extract key concepts for improved prompt
            keyConcepts = extractKeyConceptsFromKnowledgeBases(validKnowledgeBases);
            console.log('Extracted key concepts for enhanced prompt:', {
              topics: keyConcepts.topics,
              keyTerms: keyConcepts.keyTerms,
              mainIdeas: keyConcepts.mainIdeas.length
            });
          }
        }
      } catch (error) {
        console.warn('Error extracting key concepts for enhanced prompt:', error);
        // Continue with default empty concepts
      }
      
      let enhancedPrompt = `Generate a comprehensive curriculum for ${subject} for ${gradeLevel} students.
      This curriculum should incorporate the following learning styles: ${learningStyles.join(', ')}.
      ${additionalDetails ? `Consider these additional requirements: ${additionalDetails}` : ''}
      `;
      
      // Include knowledge base content with better formatting
      if (knowledgeBaseContent) {
        enhancedPrompt += `\nBased on the following knowledge base materials:\n${knowledgeBaseContent}\n`;
        
        // Add key topics if available
        if (keyConcepts.topics && keyConcepts.topics.length > 0) {
          enhancedPrompt += `\nKey topics from these materials include:\n`;
          keyConcepts.topics.forEach(topic => {
            enhancedPrompt += `- ${topic}\n`;
          });
        }
        
        // Add key terms if available
        if (keyConcepts.keyTerms && keyConcepts.keyTerms.length > 0) {
          enhancedPrompt += `\nImportant concepts to cover:\n`;
          keyConcepts.keyTerms.forEach(term => {
            enhancedPrompt += `- ${term}\n`;
          });
        }
        
        // Add main ideas if available
        if (keyConcepts.mainIdeas && keyConcepts.mainIdeas.length > 0) {
          enhancedPrompt += `\nMain ideas to incorporate:\n`;
          keyConcepts.mainIdeas.forEach((_, idx) => {
            enhancedPrompt += `- Include content about main idea ${idx+1}\n`;
          });
        }
      }
      
      // Add the desired JSON format to ensure proper output
      enhancedPrompt += `
      Format your response as a JSON object with this structure:
      {
        "title": "title of the curriculum",
        "description": "comprehensive overview of the curriculum",
        "objectives": ["learning objective 1", "learning objective 2", ...],
        "units": [
          {
            "title": "unit title",
            "description": "description of the unit",
            "lessons": [
              {
                "title": "lesson title",
                "description": "lesson description that references knowledge base content",
                "duration": 45,
                "activities": ["activity 1 that uses knowledge base concepts", "activity 2", ...],
                "resources": ["resource 1 related to knowledge base", "resource 2", ...],
                "assessments": ["assessment 1", "assessment 2", ...]
              }
            ]
          }
        ]
      }
      
      IMPORTANT: Make sure to directly reference and incorporate specific concepts, topics, and content from the knowledge base materials in the curriculum. Lessons should explicitly build on the provided knowledge base content.`;
      
      const jsonResponse = await generateCurriculumWithAI(enhancedPrompt);
      const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Enhanced service failed to return valid JSON');
      }
      
      try {
        // Attempt to parse JSON directly
        const curriculumTemplate: CurriculumTemplate = JSON.parse(jsonMatch[0]);
        return curriculumTemplate;
      } catch (jsonError) {
        console.warn('JSON parse error on enhanced service, attempting to clean and repair the JSON:', jsonError);
        // Clean up common JSON formatting issues
        const cleanedJson = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
          .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
          .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
          .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
          .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
          
        // Try parsing the cleaned JSON
        const curriculumTemplate: CurriculumTemplate = JSON.parse(cleanedJson);
        return curriculumTemplate;
      }
    } catch (enhancedError) {
      console.warn('Enhanced curriculum generation failed, falling back to original implementation:', enhancedError);
      
      // Fallback to original implementation
      // Check if Anthropic client is initialized
      if (!anthropic) {
        console.warn('Anthropic client not initialized. Unable to generate curriculum with AI.');
        throw new Error('Anthropic API not available');
      }
      
      // Get knowledge base content
      let knowledgeBaseContent = "";
      if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
        try {
          // Import storage dynamically to avoid circular dependencies
          const { storage } = await import('../storage');
          
          console.log(`Fetching knowledge bases with IDs: ${knowledgeBaseIds.join(', ')}`);
          
          // Fetch knowledge bases
          const knowledgeBases = await Promise.all(
            knowledgeBaseIds.map(id => storage.getKnowledgeBase(id))
          );
          
          // Extract metadata and content from knowledge bases using our utility
          const validKnowledgeBases = knowledgeBases.filter(kb => kb !== undefined);
          
          if (validKnowledgeBases.length > 0) {
            // Use our knowledge base extraction utility for the fallback method too
            knowledgeBaseContent = extractKnowledgeBaseContent(validKnowledgeBases);
            
            // Also extract key concepts for improved context
            const keyConcepts = extractKeyConceptsFromKnowledgeBases(validKnowledgeBases);
            
            // Log the extracted concepts for debugging
            console.log('Fallback method - Extracted key concepts from knowledge bases:', {
              topics: keyConcepts.topics,
              keyTerms: keyConcepts.keyTerms,
              mainIdeas: keyConcepts.mainIdeas.length
            });
          }
        } catch (kbError) {
          console.warn("Error fetching knowledge base content for fallback method:", kbError);
          // Continue with generation even if knowledge base fetch fails
        }
      }
      
      // Construct system prompt
      const systemPrompt = `You are an expert curriculum designer with extensive knowledge of educational best practices. 
Your task is to create a comprehensive, well-structured curriculum for ${subject} at the ${gradeLevel} level.
The curriculum should be specifically tailored to accommodate the following learning styles: ${learningStyles.join(', ')}.
${additionalDetails ? `Additionally, consider these specific requirements: ${additionalDetails}` : ''}
${knowledgeBaseContent ? `\n${knowledgeBaseContent}\n` : ''}

Please format your response as a JSON object matching this structure:
{
  "title": "Descriptive curriculum title",
  "description": "Comprehensive overview of the curriculum",
  "objectives": ["objective1", "objective2", ...],
  "units": [
    {
      "title": "Unit title",
      "description": "Unit description",
      "lessons": [
        {
          "title": "Lesson title",
          "description": "Lesson description",
          "duration": 45, // minutes
          "activities": ["activity1", "activity2", ...],
          "resources": ["resource1", "resource2", ...],
          "assessments": ["assessment1", "assessment2", ...]
        }
      ]
    }
  ]
}

The curriculum should have 4-6 units with 3-5 lessons each.`;

      const userPrompt = `Please generate a curriculum for ${subject} at the ${gradeLevel} level that incorporates ${learningStyles.join(', ')} learning styles.`;
      
      console.log(`Attempting to generate AI curriculum using fallback method for ${subject} at ${gradeLevel} level...`);
      
      // Call Claude API
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      });

      console.log('Successfully received response from Anthropic API');

      // The response content is a structured object with multiple properties
      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Unexpected response format from AI');
      }
      
      // Extract the JSON from the response
      const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from AI response');
      }
      
      try {
        // Attempt to parse JSON directly
        const curriculumTemplate: CurriculumTemplate = JSON.parse(jsonMatch[0]);
        return curriculumTemplate;
      } catch (jsonError) {
        console.warn('JSON parse error on fallback service, attempting to clean and repair the JSON:', jsonError);
        // Clean up common JSON formatting issues
        const cleanedJson = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
          .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
          .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
          .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
          .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
          
        // Try parsing the cleaned JSON
        const curriculumTemplate: CurriculumTemplate = JSON.parse(cleanedJson);
        return curriculumTemplate;
      }
    }
  } catch (error: any) {
    console.error('Error generating AI curriculum:', error);
    throw new Error('Failed to generate curriculum with AI: ' + (error.message || 'Unknown error'));
  }
}

/**
 * Generates a lesson plan using Claude AI
 */
export async function generateAILesson(
  subject: string, 
  gradeLevel: string, 
  topic: string, 
  learningStyles: string[],
  duration: number = 45
): Promise<any> {
  try {
    // Try using our enhanced function first
    try {
      console.log(`Attempting to generate AI lesson using enhanced service for ${topic} in ${subject} at ${gradeLevel} level...`);
      
      // Generate objectives from the topic
      const objectives = `Create a comprehensive understanding of ${topic} appropriate for ${gradeLevel} students`;
      
      const lessonPlanJson = await generateLessonPlanWithAI(
        subject,
        gradeLevel,
        duration,
        learningStyles,
        objectives
      );
      
      const jsonMatch = lessonPlanJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Enhanced service failed to return valid JSON');
      }
      
      try {
        // Attempt to parse JSON directly
        const lessonPlan = JSON.parse(jsonMatch[0]);
        return lessonPlan;
      } catch (jsonError) {
        console.warn('JSON parse error on enhanced lesson service, attempting to clean and repair the JSON:', jsonError);
        // Clean up common JSON formatting issues
        const cleanedJson = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
          .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
          .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
          .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
          .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
          
        // Try parsing the cleaned JSON
        const lessonPlan = JSON.parse(cleanedJson);
        return lessonPlan;
      }
    } catch (enhancedError) {
      console.warn('Enhanced lesson generation failed, falling back to original implementation:', enhancedError);
      
      // Check if Anthropic client is initialized
      if (!anthropic) {
        console.warn('Anthropic client not initialized. Unable to generate lesson with AI.');
        throw new Error('Anthropic API not available');
      }
      
      // Construct system prompt
      const systemPrompt = `You are an expert lesson planner with extensive knowledge of educational best practices.
Your task is to create a detailed lesson plan for teaching "${topic}" within the subject of ${subject} for ${gradeLevel} students.
The lesson should be designed to last approximately ${duration} minutes and accommodate these learning styles: ${learningStyles.join(', ')}.

Please format your response as a JSON object matching this structure:
{
  "title": "Descriptive lesson title",
  "description": "Overview of the lesson",
  "objectives": ["objective1", "objective2", ...],
  "materials": ["material1", "material2", ...],
  "timeline": [
    {
      "activity": "Introduction",
      "duration": 5, // minutes
      "description": "Detailed description of the activity"
    },
    // Additional timeline items...
  ],
  "assessment": "Description of assessment methods",
  "differentiation": {
    "visual": ["strategy1", "strategy2"],
    "auditory": ["strategy1", "strategy2"],
    "kinesthetic": ["strategy1", "strategy2"],
    "reading-writing": ["strategy1", "strategy2"]
  },
  "extensions": ["extension1", "extension2", ...]
}`;

      const userPrompt = `Please generate a detailed lesson plan for teaching "${topic}" within ${subject} for ${gradeLevel} students, accommodating ${learningStyles.join(', ')} learning styles and lasting ${duration} minutes.`;
      
      console.log(`Attempting to generate AI lesson using fallback method for ${topic} in ${subject} at ${gradeLevel} level...`);
      
      // Call Claude API
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      });

      // Extract the JSON from the response
      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Unexpected response format from AI');
      }
      
      const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from AI response');
      }
      
      try {
        // Attempt to parse JSON directly
        const lessonPlan = JSON.parse(jsonMatch[0]);
        return lessonPlan;
      } catch (jsonError) {
        console.warn('JSON parse error on fallback lesson service, attempting to clean and repair the JSON:', jsonError);
        // Clean up common JSON formatting issues
        const cleanedJson = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
          .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
          .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
          .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
          .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
          
        // Try parsing the cleaned JSON
        const lessonPlan = JSON.parse(cleanedJson);
        return lessonPlan;
      }
    }
  } catch (error: any) {
    console.error('Error generating AI lesson plan:', error);
    throw new Error('Failed to generate lesson plan with AI: ' + (error.message || 'Unknown error'));
  }
}

/**
 * Analyzes text and provides feedback using Claude AI
 */
export async function getAIFeedback(text: string, feedbackType: 'curriculum' | 'lesson' | 'assessment'): Promise<string> {
  try {
    // Try using our enhanced analyzeStudentWork function first
    try {
      console.log(`Attempting to analyze ${feedbackType} content using enhanced service...`);
      
      // Convert feedbackType to appropriate subject and assignment context
      let subject = 'education';
      let assignment = '';
      
      switch(feedbackType) {
        case 'curriculum':
          subject = 'curriculum design';
          assignment = 'Create a comprehensive curriculum with clear objectives, units, and lessons';
          break;
        case 'lesson':
          subject = 'instructional design';
          assignment = 'Create a detailed lesson plan with objectives, activities, and assessments';
          break;
        case 'assessment':
          subject = 'educational assessment';
          assignment = 'Create effective assessment tools that measure student learning outcomes';
          break;
      }
      
      // Use the enhanced service
      const feedback = await analyzeStudentWork(
        subject,
        assignment,
        text,
        'professional educator'
      );
      
      return feedback;
    } catch (enhancedError) {
      console.warn('Enhanced feedback service failed, falling back to original implementation:', enhancedError);
      
      // Check if Anthropic client is initialized for fallback
      if (!anthropic) {
        console.warn('Anthropic client not initialized. Unable to get AI feedback.');
        throw new Error('Anthropic API not available');
      }
      
      const systemPrompt = `You are an expert educator providing constructive feedback on ${feedbackType} content.
Your feedback should be thoughtful, specific, and actionable, highlighting both strengths and areas for improvement.
For ${feedbackType === 'curriculum' ? 'curricula' : feedbackType === 'lesson' ? 'lessons' : 'assessments'}, focus on:
- Overall structure and organization
- Alignment with educational standards
- Engagement and relevance for students
- Accommodation of diverse learning styles
- Clarity of objectives and outcomes
- ${feedbackType === 'assessment' ? 'Effectiveness in measuring learning' : 'Effectiveness of teaching methods'}

Provide your feedback in a clear, professional manner that would be helpful to an educator.`;

      console.log(`Getting AI feedback for ${feedbackType} content using fallback method...`);
      
      // Call Claude API
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Please review this ${feedbackType} content and provide constructive feedback:\n\n${text}` }
        ],
      });

      console.log(`Successfully received feedback response from Anthropic API`);
      
      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Unexpected response format from AI');
      }
      
      return contentBlock.text;
    }
  } catch (error: any) {
    console.error('Error getting AI feedback:', error);
    
    // Provide a fallback feedback message when API is unavailable
    if (error.message === 'Anthropic API not available') {
      return `**Feedback Service Unavailable**\n\nThe AI feedback service is currently unavailable. Here are some general recommendations for ${feedbackType} content:\n\n- Ensure clear objectives aligned with learning outcomes\n- Include a variety of activities for different learning styles\n- Check for logical organization and sequencing\n- Verify assessments match the stated objectives\n- Consider adding more opportunities for student engagement`;
    }
    
    throw new Error('Failed to get AI feedback: ' + (error.message || 'Unknown error'));
  }
}