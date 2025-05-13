import Anthropic from '@anthropic-ai/sdk';

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Text analysis for curriculum and lesson generation
export async function generateCurriculumWithAI(prompt: string): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-3-7-sonnet-20250219',
    });

    if (message.content[0].type === 'text') {
      return message.content[0].text;
    } else {
      throw new Error("Unexpected response format from Anthropic API");
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error generating curriculum with Claude:', errorMessage);
    throw new Error(`Failed to generate curriculum: ${errorMessage}`);
  }
}

// Generate a well-structured lesson plan
export async function generateLessonPlanWithAI(
  subject: string,
  gradeLevel: string,
  duration: number,
  learningStyles: string[],
  objectives: string
): Promise<string> {
  const prompt = `Create a detailed lesson plan for a ${subject} class for ${gradeLevel} students.
The lesson should be ${duration} minutes long and accommodate these learning styles: ${learningStyles.join(', ')}.
The learning objectives are: ${objectives}

Format the response as a JSON object with these fields:
- title: string (lesson title)
- duration: number (in minutes)
- objectives: string[] (list of specific objectives)
- materials: string[] (list of required materials)
- activities: Array of objects, each with:
  - title: string (activity name)
  - duration: number (in minutes)
  - description: string (detailed instructions)
  - learningStyles: string[] (styles this activity addresses)
- assessments: string[] (ways to assess student learning)
- extensions: string[] (ways to extend or modify the lesson)

Make the lesson engaging, interactive, and appropriate for the grade level. Ensure activities align with specified learning styles.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      system: "You are an expert educational curriculum designer specializing in creating detailed lesson plans. Always provide responses in valid JSON format without explanations or markdown formatting.",
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    if (response.content[0].type === 'text') {
      return response.content[0].text;
    } else {
      throw new Error("Unexpected response format from Anthropic API");
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error generating lesson plan with Claude:', errorMessage);
    throw new Error(`Failed to generate lesson plan: ${errorMessage}`);
  }
}

// Virtual tutor functionality
export async function askVirtualTutor(
  subject: string, 
  question: string, 
  learningLevel: string,
  learningStyle: string,
  outputFormat: string = "text"
): Promise<string> {
  // Determine if the output should be formatted as JSON
  const isJsonOutput = outputFormat.toLowerCase().includes("json") || 
                       outputFormat.toLowerCase().includes("structured") ||
                       outputFormat.toLowerCase().includes("visual");
  
  let prompt = `I'm a ${learningLevel} student with a preference for ${learningStyle} learning. 
I'm studying ${subject} and I have this question: ${question}`;

  // Add JSON formatting instructions if needed
  if (isJsonOutput) {
    prompt += `\n\nPlease format your response as a valid JSON object that I can parse directly.`;
  }

  try {
    // Create system message based on output format
    let systemMessage = `You are a helpful, encouraging educational tutor specializing in ${subject}. 
Tailor your explanations to ${learningLevel} students who prefer ${learningStyle} learning styles.
Provide clear, accurate information with examples and analogies when helpful.
Keep responses educational, engaging, and appropriate for the student's level.`;

    // Add JSON-specific instructions if needed
    if (isJsonOutput) {
      systemMessage += `\n\nVERY IMPORTANT: You must respond with ONLY valid JSON. Do not include any explanation text, markdown formatting, 
or any other text before or after the JSON object. The JSON must be parseable by JavaScript's JSON.parse function.
Do not include backticks, code block markers or any other non-JSON content in your response.`;
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      system: systemMessage,
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    // The response content is a structured object with multiple properties
    const responseText = response.content[0].text;
    
    // If JSON output was requested, try to extract JSON properly
    if (isJsonOutput) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          // Validate it parses correctly
          JSON.parse(jsonMatch[0]);
          return jsonMatch[0]; // Return just the JSON part
        } catch (parseError) {
          console.warn('Anthropic response contained JSON-like content but failed to parse:', parseError);
          
          // Try to clean up the JSON
          const cleanedJson = jsonMatch[0]
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
            .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
            .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
            .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
            .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
            
          try {
            // Try parsing the cleaned JSON
            JSON.parse(cleanedJson);
            return cleanedJson;
          } catch (finalParseError) {
            console.error("Failed to parse cleaned JSON from Anthropic response:", finalParseError);
            // Fall back to returning the original text
          }
        }
      }
    }
    
    return responseText;
  } catch (error) {
    console.error('Error with virtual tutor:', error);
    
    if (isJsonOutput) {
      // Return a minimal valid JSON if that was the expected format
      return JSON.stringify({
        title: "Fallback Response",
        content: "I apologize, but the virtual tutor service is temporarily unavailable. Please try again later.",
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    throw new Error(`Virtual tutor service unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Analyze and provide feedback on student work
export async function analyzeStudentWork(
  subject: string,
  assignment: string,
  studentResponse: string,
  gradeLevel: string
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      system: `You are an experienced ${subject} teacher providing constructive feedback to ${gradeLevel} students.
Focus on identifying strengths, areas for improvement, and specific suggestions to enhance learning.
Always be encouraging, educational, and appropriate for the student's grade level.`,
      max_tokens: 1500,
      messages: [
        { 
          role: 'user', 
          content: `Please analyze this ${gradeLevel} student's response to this ${subject} assignment:
          
Assignment: ${assignment}

Student Response: ${studentResponse}

Provide clear, specific feedback including:
1. Strengths of the response
2. Areas for improvement 
3. Specific suggestions to enhance understanding
4. Overall assessment`
        }
      ],
    });

    if (response.content[0].type === 'text') {
      return response.content[0].text;
    } else {
      throw new Error("Unexpected response format from Anthropic API");
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error analyzing student work:', errorMessage);
    throw new Error(`Unable to analyze student work: ${errorMessage}`);
  }
}

export default {
  generateCurriculumWithAI,
  generateLessonPlanWithAI,
  askVirtualTutor,
  analyzeStudentWork
};