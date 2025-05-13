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

// Import Anthropic service for fallback
import { generateCurriculumWithAI } from './anthropic';
import { isAnthropicAvailable } from './anthropicService';

// Generate text using OpenAI's GPT-4o with Anthropic fallback
export async function generateContentWithOpenAI(
  prompt: string,
  responseFormat: "text" | "json_object" = "text",
  maxTokens: number = 4000,
  retries: number = 2
): Promise<string> {
  let currentRetry = 0;
  
  while (currentRetry <= retries) {
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
      console.error(`Error generating content with OpenAI (attempt ${currentRetry + 1}/${retries + 1}):`, error);
      
      // Check if this is a rate limit error (429)
      const isRateLimit = error.status === 429 || 
        (error.message && error.message.includes('429')) || 
        (error.error && error.error.type === 'insufficient_quota');
      
      // If we've exhausted retries or it's not a rate limit issue, try Anthropic as fallback
      if (currentRetry >= retries || !isRateLimit) {
        // Before giving up, check if Anthropic is available as a fallback
        if (isAnthropicAvailable()) {
          console.log("OpenAI API quota exceeded or unavailable. Attempting fallback to Anthropic/Claude...");
          try {
            // Use Anthropic's Claude API as a fallback
            const claudeResponse = await generateCurriculumWithAI(prompt);
            console.log("Successfully generated content using Anthropic/Claude fallback");
            return claudeResponse;
          } catch (anthropicError) {
            console.error("Anthropic fallback failed:", anthropicError);
            throw new Error(`Failed to generate content with both OpenAI and Anthropic: ${error.message}`);
          }
        } else {
          // If Anthropic is not available either, give up and throw the original error
          throw new Error(`Failed to generate content: ${error.message}`);
        }
      }
      
      // If it's a rate limit error and we have retries left, exponential backoff
      if (isRateLimit && currentRetry < retries) {
        const delay = Math.pow(2, currentRetry) * 1000; // Exponential backoff: 1s, 2s, 4s, etc.
        console.log(`OpenAI rate limit exceeded. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        currentRetry++;
      } else {
        throw new Error(`Failed to generate content: ${error.message}`);
      }
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw new Error("Failed to generate content after multiple attempts");
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
    // First try OpenAI with retries and fallback
    try {
      const result = await generateContentWithOpenAI(prompt, "json_object");
      
      // Handle potential non-JSON responses
      try {
        return JSON.parse(result);
      } catch (parseError) {
        console.warn("Failed to parse JSON response:", parseError);
        // Try to extract JSON from text response
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error("Unable to parse response as JSON");
      }
    } catch (openaiError) {
      console.error("OpenAI service failed (with fallback attempts):", openaiError);
      
      // If everything failed with OpenAI, try direct Anthropic integration
      if (isAnthropicAvailable()) {
        console.log("Attempting direct Anthropic integration for activity generation...");
        try {
          // Using Anthropic directly for educational activity generation
          // Import necessary functions
          const { askVirtualTutor } = await import('./anthropic');
          
          // Create a specialized prompt for Anthropic
          const anthropicPrompt = `
          Generate a ${difficulty} difficulty ${activityType} about ${subject} for students in the ${ageRange} age range.
          
          Specific instructions: ${instructions}
          
          Reference material: ${knowledgeBaseContent}
          
          Format the response as a valid JSON object following this structure exactly:
          {
            "title": "Title for the ${activityType}",
            "description": "Description of the ${activityType}",
            "instructions": "Instructions for completing the ${activityType}",
            "content": {}, // Content structure for ${activityType}
            "targetSkills": ["skill1", "skill2"],
            "ageRange": "${ageRange}",
            "difficulty": "${difficulty}",
            "timeRequired": "Time in minutes"
          }
          
          For ${activityType}, the content structure should be appropriate.
          `;
          
          // Use the askVirtualTutor function which is designed for educational content
          const anthropicResult = await askVirtualTutor(subject, anthropicPrompt, ageRange, "visual");
          
          // Try to extract and parse the JSON
          const jsonMatch = anthropicResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[0]);
            } catch (parseError) {
              console.error("Failed to parse Anthropic JSON response:", parseError);
              throw new Error("Unable to generate or parse activity content with Anthropic");
            }
          } else {
            throw new Error("Anthropic response did not contain valid JSON");
          }
        } catch (anthropicError) {
          console.error("Anthropic direct activity generation failed:", anthropicError);
          
          // If both OpenAI and direct Anthropic implementations fail, provide a more detailed error
          throw new Error(`Failed to generate ${activityType} with both OpenAI and Anthropic services. Please try again later or contact support.`);
        }
      } else {
        // If Anthropic is not available as a fallback, propagate the original error
        throw new Error(`Failed to generate ${activityType}: ${openaiError.message}. Anthropic fallback is not available.`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error generating educational activity:", errorMessage);
    throw new Error(`Failed to generate ${activityType}: ${errorMessage}`);
  }
}

export default openai;