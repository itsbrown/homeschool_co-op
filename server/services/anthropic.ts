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

    return message.content[0].text;
  } catch (error) {
    console.error('Error generating curriculum with Claude:', error);
    throw new Error(`Failed to generate curriculum: ${error.message}`);
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

    return response.content[0].text;
  } catch (error) {
    console.error('Error generating lesson plan with Claude:', error);
    throw new Error(`Failed to generate lesson plan: ${error.message}`);
  }
}

// Virtual tutor functionality
export async function askVirtualTutor(
  subject: string, 
  question: string, 
  learningLevel: string,
  learningStyle: string
): Promise<string> {
  const prompt = `I'm a ${learningLevel} student with a preference for ${learningStyle} learning. 
I'm studying ${subject} and I have this question: ${question}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      system: `You are a helpful, encouraging educational tutor specializing in ${subject}. 
Tailor your explanations to ${learningLevel} students who prefer ${learningStyle} learning styles.
Provide clear, accurate information with examples and analogies when helpful.
Keep responses educational, engaging, and appropriate for the student's level.`,
      max_tokens: 1000,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error with virtual tutor:', error);
    throw new Error(`Virtual tutor service unavailable: ${error.message}`);
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

    return response.content[0].text;
  } catch (error) {
    console.error('Error analyzing student work:', error);
    throw new Error(`Unable to analyze student work: ${error.message}`);
  }
}

export default {
  generateCurriculumWithAI,
  generateLessonPlanWithAI,
  askVirtualTutor,
  analyzeStudentWork
};