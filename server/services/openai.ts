import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Check if OpenAI API key is available
export async function checkOpenAIStatus() {
  try {
    // Simple models list request to check if API key is valid
    await openai.models.list();
    return { available: true, status: "operational" };
  } catch (error) {
    console.error("OpenAI API key check failed:", error);
    return { available: false, status: "error", message: error.message };
  }
}

// Generate text using OpenAI's GPT-4o
export async function generateContentWithOpenAI(
  prompt: string,
  responseFormat: "text" | "json_object" = "text",
  maxTokens: number = 4000
): Promise<string> {
  try {
    const options: any = {
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    };
    
    // Add response format if JSON is requested
    if (responseFormat === "json_object") {
      options.response_format = { type: "json_object" };
    }
    
    const response = await openai.chat.completions.create(options);
    
    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("Error generating content with OpenAI:", error);
    throw new Error(`Failed to generate content: ${error.message}`);
  }
}

// Generate structured content for educational activities
export async function generateEducationalActivity(
  subject: string,
  ageRange: string,
  activityType: string,
  difficulty: string,
  instructions: string,
  knowledgeBaseContent: string
): Promise<any> {
  const prompt = `
  You are an educational content creator specializing in creating engaging, age-appropriate ${activityType}s for students.
  
  Create a ${difficulty} difficulty ${activityType} about ${subject} for students in the ${ageRange} age range.
  
  Specific instructions: ${instructions}
  
  Use the following knowledge base content as reference material:
  ${knowledgeBaseContent}
  
  Return a JSON object with the following structure:
  {
    "title": "An engaging title for the ${activityType}",
    "description": "Brief description of the ${activityType} and its educational goals",
    "instructions": "Clear instructions for completing the ${activityType}",
    "content": {}, // Content structure varies based on activity type
    "targetSkills": ["skill1", "skill2"],
    "ageRange": "${ageRange}",
    "difficulty": "${difficulty}",
    "timeRequired": "Estimated time to complete (in minutes)"
  }
  
  For the content structure, use the following templates based on activity type:
  
  - worksheet: {
      "questions": [
        {"question": "Question text", "type": "multiple_choice|short_answer|true_false|matching", "answer": "correct answer", "options": ["option1", "option2"] }
      ],
      "answerKey": true or false (whether to include answer key)
    }
  
  - crossword: {
      "words": [
        {"word": "word", "clue": "clue for the word", "row": number, "col": number, "direction": "across|down"}
      ],
      "size": {"width": number, "height": number}
    }
  
  - coloring: {
      "image": "detailed textual description of the image to color",
      "elements": [
        {"name": "part of the image", "description": "description of what to color"}
      ],
      "learningFacts": ["educational fact 1", "educational fact 2"]
    }
  
  - wordsearch: {
      "words": ["word1", "word2", "word3"],
      "gridSize": {"width": number, "height": number},
      "clues": ["clue for word1", "clue for word2", "clue for word3"]
    }
  
  - maze: {
      "theme": "theme of the maze",
      "complexity": number (1-10),
      "educationalCheckpoints": [
        {"question": "Question at checkpoint", "answer": "Answer"}
      ]
    }
  
  Make sure all content is educational, age-appropriate, and engaging for the specified age group.
  `;

  try {
    const result = await generateContentWithOpenAI(prompt, "json_object");
    return JSON.parse(result);
  } catch (error) {
    console.error("Error generating educational activity:", error);
    throw new Error(`Failed to generate ${activityType}: ${error.message}`);
  }
}

export default openai;