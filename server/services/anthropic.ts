import Anthropic from '@anthropic-ai/sdk';

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Interface for multi-step curriculum generation
export interface CurriculumTemplate {
  title: string;
  subject: string;
  gradeLevel: string;
  description: string;
  units: {
    title: string;
    description: string;
    learningObjectives: string[];
    keyTopics: string[];
    activities: string[];
    assessments: string[];
    resources: string[];
  }[];
  standardsAlignment: string[];
  learningApproaches: string[];
  differentiationStrategies: string[];
}

// Interface for multi-step lesson generation
export interface LessonTemplate {
  title: string;
  subject: string;
  gradeLevel: string;
  duration: number;
  learningObjectives: string[];
  materials: string[];
  activities: {
    title: string;
    duration: number;
    description: string;
    learningStyles: string[];
  }[];
  assessments: string[];
  extensions: string[];
  differentiationStrategies: string[];
}

// Multi-step curriculum generation with iterative refinement
export async function generateCurriculumWithAI(prompt: string, contextualInfo?: any): Promise<string> {
  try {
    // Step 1: Generate the basic structure with key elements
    const structurePrompt = `
${prompt}

First, create an outline for this curriculum that includes:
1. An appropriate title and overview
2. Key units or modules (4-8 units)
3. Essential learning objectives for each unit
4. Primary instructional approaches
5. Alignment with educational standards

Format this as a JSON skeleton that will be expanded in subsequent steps.
`;

    const structureResponse = await anthropic.messages.create({
      max_tokens: 1500,
      model: MODEL,
      system: "You are an expert curriculum designer with deep knowledge of educational standards, pedagogy, and subject matter expertise. Create a well-structured, standards-aligned curriculum outline.",
      messages: [{ role: 'user', content: structurePrompt }],
    });
    
    let curriculumStructure = "";
    try {
      curriculumStructure = extractJSON(structureResponse.content);
    } catch (error) {
      console.error("Error extracting JSON structure:", error);
      curriculumStructure = structureResponse.content[0].text;
    }

    // Step 2: Expand with detailed content for each unit
    const contentPrompt = `
I have a curriculum structure that needs to be expanded with detailed content:

${curriculumStructure}

For each unit in this curriculum, please add:
1. Detailed descriptions of key topics
2. Specific learning activities (3-5 per unit)
3. Assessment strategies (2-3 per unit)
4. Required resources and materials
5. Scaffolding and support strategies

Please maintain the original structure while adding these details.
`;

    const contentResponse = await anthropic.messages.create({
      max_tokens: 3000,
      model: MODEL,
      system: "You are an experienced educational content designer. Expand this curriculum with engaging, inclusive, and pedagogically sound content.",
      messages: [{ role: 'user', content: contentPrompt }],
    });
    
    let detailedCurriculum = "";
    try {
      detailedCurriculum = extractJSON(contentResponse.content);
    } catch (error) {
      console.error("Error extracting JSON content:", error);
      detailedCurriculum = contentResponse.content[0].text;
    }

    // Step 3: Add activities, differentiation, and assessment strategies
    const activitiesPrompt = `
I have a detailed curriculum that needs to be enhanced with more specific activities and differentiation strategies:

${detailedCurriculum}

Please enhance this curriculum by:
1. Adding 2-3 specific interactive activities for each unit 
2. Including differentiation strategies for diverse learners (visual, auditory, kinesthetic, etc.)
3. Adding detailed rubrics or criteria for assessments
4. Suggesting cross-curricular connections where appropriate
5. Providing reflection and metacognitive activities

Ensure the activities are engaging, appropriately challenging, and aligned with the learning objectives.
`;

    const activitiesResponse = await anthropic.messages.create({
      max_tokens: 3000,
      model: MODEL,
      system: "You are a specialist in designing engaging educational activities and inclusive teaching strategies. Enhance this curriculum with differentiated activities that address various learning modalities.",
      messages: [{ role: 'user', content: activitiesPrompt }],
    });

    let finalCurriculum = "";
    try {
      finalCurriculum = extractJSON(activitiesResponse.content);
    } catch (error) {
      console.error("Error extracting JSON activities:", error);
      finalCurriculum = activitiesResponse.content[0].text;
    }

    return finalCurriculum;
  } catch (error) {
    console.error('Error generating curriculum with Claude:', error);
    throw new Error(`Failed to generate curriculum: ${error.message}`);
  }
}

// Multi-step lesson plan generation with iterative refinement
export async function generateLessonPlanWithAI(
  subject: string,
  gradeLevel: string,
  duration: number,
  learningStyles: string[],
  objectives: string,
  contextualInfo?: any
): Promise<string> {
  try {
    // Step 1: Generate the basic lesson structure
    const structurePrompt = `
Create a structured lesson plan for a ${subject} class for ${gradeLevel} students.
The lesson should be ${duration} minutes long and accommodate these learning styles: ${learningStyles.join(', ')}.
The learning objectives are: ${objectives}

First, create an outline that includes:
1. A compelling title that captures the lesson's focus
2. Clear learning objectives (3-5)
3. Required materials and resources
4. A time-based structure for the lesson flow
5. Assessment strategies

Keep this focused on structure rather than detailed content at this stage.
`;

    const structureResponse = await anthropic.messages.create({
      max_tokens: 1500,
      model: MODEL,
      system: "You are an expert educational planner specializing in lesson structure and design. Create a well-structured, time-efficient lesson plan outline.",
      messages: [{ role: 'user', content: structurePrompt }],
    });

    let lessonStructure = "";
    try {
      lessonStructure = extractJSON(structureResponse.content);
    } catch (error) {
      console.error("Error extracting JSON structure:", error);
      lessonStructure = structureResponse.content[0].text;
    }

    // Step 2: Develop detailed activities and content
    const contentPrompt = `
I have a lesson plan structure that needs to be expanded with detailed content:

${lessonStructure}

Please add detailed content to this lesson plan, including:
1. Specific instructions for each learning activity
2. Discussion questions and prompts
3. Examples to be presented
4. Content for any handouts or materials
5. Detailed explanations of key concepts to be taught

Focus on creating engaging content that aligns with the ${gradeLevel} level and addresses the learning styles: ${learningStyles.join(', ')}.
`;

    const contentResponse = await anthropic.messages.create({
      max_tokens: 2000,
      model: MODEL,
      system: "You are an expert subject matter specialist in ${subject} with experience creating engaging educational content for ${gradeLevel} students. Add rich, accurate content to this lesson plan.",
      messages: [{ role: 'user', content: contentPrompt }],
    });

    let detailedLesson = "";
    try {
      detailedLesson = extractJSON(contentResponse.content);
    } catch (error) {
      console.error("Error extracting JSON content:", error);
      detailedLesson = contentResponse.content[0].text;
    }

    // Step 3: Add differentiation, assessment, and extensions
    const finalizePrompt = `
I have a detailed lesson plan that needs to be finalized with differentiation strategies, assessments, and extensions:

${detailedLesson}

Please enhance this lesson plan by adding:
1. Specific differentiation strategies for various learning needs (advanced students, struggling students, ESL, etc.)
2. Detailed assessment criteria or rubrics
3. Extension activities for students who finish early or want additional challenges
4. Potential modifications based on available technology or resources
5. Closure and reflection activities

Format the response as a complete, well-structured JSON object that can be directly implemented by an educator.
`;

    const finalResponse = await anthropic.messages.create({
      max_tokens: 2500,
      model: MODEL,
      system: "You are a comprehensive educational designer specializing in inclusive, differentiated instruction. Finalize this lesson plan with strategies to reach all learners, meaningful assessments, and thoughtful extensions. Always provide responses in valid JSON format without explanations or markdown formatting.",
      messages: [{ role: 'user', content: finalizePrompt }],
    });

    let finalLesson = "";
    try {
      finalLesson = extractJSON(finalResponse.content);
    } catch (error) {
      console.error("Error extracting JSON finalization:", error);
      finalLesson = finalResponse.content[0].text;
    }

    return finalLesson;
  } catch (error) {
    console.error('Error generating lesson plan with Claude:', error);
    throw new Error(`Failed to generate lesson plan: ${error.message}`);
  }
}

// Enhanced virtual tutor with contextual awareness
export async function askVirtualTutor(
  subject: string, 
  question: string, 
  learningLevel: string,
  learningStyle: string,
  previousInteractions?: Array<{role: string, content: string}>
): Promise<string> {
  const prompt = `I'm a ${learningLevel} student with a preference for ${learningStyle} learning. 
I'm studying ${subject} and I have this question: ${question}`;

  try {
    // Create messages array with previous interactions if available
    const messages = previousInteractions ? 
      [...previousInteractions, { role: 'user' as const, content: prompt }] :
      [{ role: 'user' as const, content: prompt }];

    const response = await anthropic.messages.create({
      model: MODEL,
      system: `You are a helpful, encouraging educational tutor specializing in ${subject}. 
Tailor your explanations to ${learningLevel} students who prefer ${learningStyle} learning styles.
Provide clear, accurate information with examples and analogies when helpful.
Use the following strategies based on learning style:
- For visual learners: describe diagrams, charts, and visual representations
- For auditory learners: use clear explanations with rhythm and repetition
- For kinesthetic learners: suggest hands-on activities or experiments
- For reading/writing learners: provide structured text explanations with bullet points and lists

Keep responses educational, engaging, and appropriate for the student's level.`,
      max_tokens: 1500,
      messages: messages,
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error with virtual tutor:', error);
    throw new Error(`Virtual tutor service unavailable: ${error.message}`);
  }
}

// Enhanced student work analysis with specific feedback areas
export async function analyzeStudentWork(
  subject: string,
  assignment: string,
  studentResponse: string,
  gradeLevel: string,
  rubricItems?: string[]
): Promise<string> {
  try {
    // Prepare rubric content if provided
    const rubricContent = rubricItems ? 
      `\nUse the following rubric items for assessment:\n${rubricItems.map(item => `- ${item}`).join('\n')}` : 
      '';

    const response = await anthropic.messages.create({
      model: MODEL,
      system: `You are an experienced ${subject} teacher providing constructive feedback to ${gradeLevel} students.
Focus on identifying strengths, areas for improvement, and specific suggestions to enhance learning.
Always be encouraging, educational, and appropriate for the student's grade level.
Provide feedback that is specific, actionable, and growth-oriented.`,
      max_tokens: 2000,
      messages: [
        { 
          role: 'user', 
          content: `Please analyze this ${gradeLevel} student's response to this ${subject} assignment:
          
Assignment: ${assignment}

Student Response: ${studentResponse}
${rubricContent}

Provide clear, specific feedback including:
1. Strengths of the response (at least 3 specific strengths)
2. Areas for improvement (2-3 specific areas)
3. Specific suggestions to enhance understanding with exact examples
4. Conceptual misunderstandings to address
5. Next steps for the student to focus on
6. Overall assessment with qualitative comments`
        }
      ],
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error analyzing student work:', error);
    throw new Error(`Unable to analyze student work: ${error.message}`);
  }
}

// Helper function to extract JSON from AI response
function extractJSON(content: any): string {
  if (!content || !content[0] || typeof content[0].text !== 'string') {
    throw new Error('Invalid content format');
  }
  
  const text = content[0].text;
  
  // Try to find JSON object in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    // Check if the extracted JSON is valid
    try {
      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch (e) {
      // If not valid JSON, fall back to the text
      return text;
    }
  }
  
  return text;
}

export default {
  generateCurriculumWithAI,
  generateLessonPlanWithAI,
  askVirtualTutor,
  analyzeStudentWork
};