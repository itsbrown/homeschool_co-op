import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client with API key from environment variables
let anthropic: Anthropic | null = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('Anthropic API initialized successfully for tutor service');
  } else {
    console.warn('Anthropic API Key not provided for tutor service');
  }
} catch (error) {
  console.error('Failed to initialize Anthropic client for tutor service:', error);
}

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

/**
 * Get a response from the AI tutor
 */
export async function getAITutorResponse(
  userMessage: string, 
  subject?: string, 
  gradeLevel?: string
): Promise<string> {
  try {
    // Check if Anthropic client is initialized
    if (!anthropic) {
      console.warn('Anthropic client not initialized. Providing fallback tutor response.');
      throw new Error('Anthropic API not available');
    }

    console.log(`Processing tutor request for subject: ${subject || 'general'}, grade level: ${gradeLevel || 'any'}`);
    
    // Construct system prompt
    const systemPrompt = `You are Edison, an expert AI tutor specializing in ${subject || 'all academic subjects'} 
at the ${gradeLevel || 'all levels'} level. You provide clear, accurate, and helpful responses to student questions.
Your tone is friendly, encouraging, and professional. You follow these guidelines:

1. Keep responses concise (under 200 words) but complete
2. Include examples when helpful
3. Break down complex topics into simple steps
4. Suggest additional resources when appropriate
5. When unsure, admit limitations instead of providing possibly incorrect information
6. Respond in the context of the current subject and grade level
7. Avoid providing answers to specific homework problems or test questions

Always be positive and encouraging, helping students understand concepts rather than just giving them answers.`;

    // Call Claude API with user message
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ],
    });

    console.log('Successfully received tutor response from Anthropic API');

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }
    
    return contentBlock.text;
  } catch (error: any) {
    console.error('Error getting AI tutor response:', error);
    
    // Provide a fallback response when API is unavailable
    if (error.message === 'Anthropic API not available') {
      const subjectText = subject ? ` about ${subject}` : '';
      const gradeLevelText = gradeLevel ? ` for ${gradeLevel} level` : '';
      
      return `**Edison AI Tutor (Offline Mode)**\n\nI'm sorry, but I'm currently unable to provide a personalized response to your question${subjectText}${gradeLevelText}. Our AI tutoring system is temporarily unavailable.\n\nWhile we work to restore the service, you might find these resources helpful:\n\n- Check your textbook's index for relevant topics\n- Visit Khan Academy for free lessons on most academic subjects\n- Consider using educational resources like CrashCourse or educational YouTube channels\n\nThank you for your understanding.`;
    }
    
    throw new Error('Failed to get tutor response: ' + (error.message || 'Unknown error'));
  }
}

/**
 * Get suggestions for additional learning resources
 */
export async function getSuggestedResources(
  topic: string, 
  subject: string,
  gradeLevel: string,
  learningStyle?: string
): Promise<string[]> {
  try {
    // Check if Anthropic client is initialized
    if (!anthropic) {
      console.warn('Anthropic client not initialized. Providing fallback resource suggestions.');
      throw new Error('Anthropic API not available');
    }

    console.log(`Getting resource suggestions for topic: ${topic}, subject: ${subject}, grade level: ${gradeLevel}${learningStyle ? `, learning style: ${learningStyle}` : ''}`);
    
    // Construct system prompt
    const systemPrompt = `You are a specialized AI designed to recommend high-quality educational resources.
Given a topic, subject, grade level, and learning style, provide 3-5 specific resource recommendations.
Format your output as a JSON array of strings, with each string containing a single resource recommendation.
Example: ["Khan Academy: Introduction to Algebra", "YouTube: MathAntics Division Explained", "Interactive simulation: PhET Circuit Construction Kit"]

Be specific with your recommendations, providing actual resource names and platforms rather than generic suggestions.
Adapt recommendations to the specified learning style if provided.`;

    // User prompt with request details
    const userPrompt = `Please suggest some educational resources for learning about "${topic}" 
in the subject of ${subject} for ${gradeLevel} students${learningStyle ? ` with a ${learningStyle} learning style` : ''}.`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });

    console.log('Successfully received resource suggestions from Anthropic API');

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }
    
    // Extract JSON array from response
    const match = contentBlock.text.match(/\[(.*)\]/s);
    if (!match) {
      throw new Error('Failed to parse resource recommendations from AI response');
    }
    
    try {
      return JSON.parse(`[${match[1]}]`);
    } catch (e) {
      return contentBlock.text.split('\n').filter(line => line.trim().length > 0).slice(0, 5);
    }
  } catch (error: any) {
    console.error('Error getting resource suggestions:', error);
    
    // Provide fallback suggestions when API is unavailable
    if (error.message === 'Anthropic API not available') {
      // Generic resources based on subject
      const subjectResources: Record<string, string[]> = {
        mathematics: [
          "Khan Academy: Math Curriculum",
          "Desmos: Interactive Math Tools",
          "Wolfram Alpha: Math Problem Solver",
          "Brilliant.org: Interactive Math Courses",
          "YouTube: 3Blue1Brown Math Visualizations"
        ],
        science: [
          "Khan Academy: Science Courses",
          "NASA Education Resources",
          "National Geographic Education",
          "PhET Interactive Simulations",
          "YouTube: Crash Course Science"
        ],
        history: [
          "Khan Academy: History & Humanities",
          "Smithsonian Learning Lab",
          "Library of Congress Digital Collections",
          "Crash Course History on YouTube",
          "BBC History Resources"
        ],
        english: [
          "Purdue Online Writing Lab",
          "ReadWriteThink.org",
          "Grammarly",
          "Project Gutenberg (Free eBooks)",
          "YouTube: Crash Course Literature"
        ],
        default: [
          "Khan Academy",
          "YouTube Educational Channels",
          "Coursera Free Courses",
          "edX Free Courses",
          "Open Educational Resources (OER) Commons"
        ]
      };
      
      // Select resources based on subject or use defaults
      const lowerSubject = subject.toLowerCase();
      let resources = subjectResources.default;
      
      for (const [key, value] of Object.entries(subjectResources)) {
        if (lowerSubject.includes(key)) {
          resources = value;
          break;
        }
      }
      
      return resources;
    }
    
    throw new Error('Failed to get resource suggestions: ' + (error.message || 'Unknown error'));
  }
}