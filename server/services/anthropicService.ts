import Anthropic from '@anthropic-ai/sdk';
import { AIGenerationFormData } from '@/lib/types';
import { CurriculumTemplate } from './curriculumService';

// Initialize Anthropic client with API key from environment variables
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

/**
 * Generates a curriculum template using Claude AI
 */
export async function generateAICurriculum(formData: AIGenerationFormData): Promise<CurriculumTemplate> {
  try {
    const { subject, gradeLevel, learningStyles, additionalDetails } = formData;
    
    // Construct system prompt
    const systemPrompt = `You are an expert curriculum designer with extensive knowledge of educational best practices. 
Your task is to create a comprehensive, well-structured curriculum for ${subject} at the ${gradeLevel} level.
The curriculum should be specifically tailored to accommodate the following learning styles: ${learningStyles.join(', ')}.
${additionalDetails ? `Additionally, consider these specific requirements: ${additionalDetails}` : ''}

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
    
    // Call Claude API
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });

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
    
    const curriculumTemplate: CurriculumTemplate = JSON.parse(jsonMatch[0]);
    return curriculumTemplate;
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
    
    const lessonPlan = JSON.parse(jsonMatch[0]);
    return lessonPlan;
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

    // Call Claude API
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Please review this ${feedbackType} content and provide constructive feedback:\n\n${text}` }
      ],
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }
    
    return contentBlock.text;
  } catch (error: any) {
    console.error('Error getting AI feedback:', error);
    throw new Error('Failed to get AI feedback: ' + (error.message || 'Unknown error'));
  }
}