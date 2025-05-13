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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("OpenAI API key check failed:", errorMessage);
    return { available: false, status: "error", message: errorMessage };
  }
}

// Import Anthropic service for fallback
import { generateCurriculumWithAI } from './anthropic';
import { isAnthropicAvailable } from './anthropicService';

// Move imports to top-level to avoid circular dependencies
import { askVirtualTutor } from './anthropic';

/**
 * Generate a fallback educational activity when AI services are unavailable
 * @param subject The subject of the activity
 * @param ageRange Target age range
 * @param activityType Type of activity to generate (worksheet, crossword, etc.)
 * @param difficulty Difficulty level
 * @returns A complete activity object
 */
function generateFallbackActivity(
  subject: string,
  ageRange: string,
  activityType: string,
  difficulty: string
): any {
  const capitalizedSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
  const today = new Date().toLocaleDateString();
  
  // Base activity structure
  const activity = {
    title: `${capitalizedSubject} ${activityType.charAt(0).toUpperCase() + activityType.slice(1)} Activity`,
    description: `A ${difficulty} level ${activityType} activity about ${subject} for ${ageRange} students.`,
    instructions: `Complete this ${activityType} activity about ${subject}.`,
    subject: subject,
    ageRange: ageRange,
    difficulty: difficulty,
    createdAt: today
  };

  // Add specific content based on activity type
  switch (activityType.toLowerCase()) {
    case 'worksheet':
      return {
        ...activity,
        content: {
          questions: [
            `What are three important facts about ${subject}?`,
            `How does ${subject} relate to everyday life?`,
            `Why is studying ${subject} important?`
          ],
          resources: [
            `${capitalizedSubject} textbook`,
            'Educational website',
            'Library resources'
          ]
        }
      };
      
    case 'crossword':
      return {
        ...activity,
        content: {
          words: getMeaningfulWords(subject, 8),
          clues: getCluesForWords(subject, 8)
        }
      };
      
    case 'coloring':
      return {
        ...activity,
        content: {
          theme: `American Symbols: Educational ${capitalizedSubject} Coloring Activity`,
          elements: [
            "Liberty Bell",
            "American Flag",
            "Bald Eagle",
            "Constitution"
          ],
          description: "Color these American symbols while learning about their historical importance."
        }
      };
      
    case 'wordsearch':
      return {
        ...activity,
        content: {
          words: getMeaningfulWords(subject, 10),
          gridSize: 10,
          title: `${capitalizedSubject} Word Search Puzzle`
        }
      };
      
    case 'maze':
      return {
        ...activity,
        content: {
          theme: `Journey Through ${capitalizedSubject}`,
          complexity: difficultyToNumber(difficulty),
          educationalCheckpoints: [
            {question: `What is a key concept in ${subject}?`, answer: "Key concept explanation"},
            {question: `How do we apply ${subject} knowledge?`, answer: "Application example"}
          ]
        }
      };
      
    default:
      return {
        ...activity,
        content: {
          title: `${capitalizedSubject} Learning Activity`,
          sections: [
            {
              title: "Introduction",
              content: `Learn about the fundamentals of ${subject}.`
            },
            {
              title: "Practice",
              content: `Apply your knowledge of ${subject} with these exercises.`
            },
            {
              title: "Review",
              content: `Test your understanding of ${subject}.`
            }
          ]
        }
      };
  }
}

/**
 * Get meaningful words related to a subject for word games
 */
function getMeaningfulWords(subject: string, count: number): string[] {
  // Map of subjects to related vocabulary
  const subjectWords: Record<string, string[]> = {
    'math': ['addition', 'subtraction', 'multiplication', 'division', 'fraction', 'decimal', 'algebra', 'geometry', 'equation', 'number', 'pattern', 'formula'],
    'science': ['experiment', 'hypothesis', 'observation', 'microscope', 'molecule', 'element', 'biology', 'chemistry', 'physics', 'laboratory', 'research', 'discovery'],
    'history': ['artifact', 'century', 'civilization', 'colony', 'constitution', 'democracy', 'document', 'empire', 'freedom', 'government', 'independence', 'liberty'],
    'english': ['vocabulary', 'grammar', 'spelling', 'sentence', 'paragraph', 'essay', 'literature', 'poetry', 'fiction', 'character', 'setting', 'plot'],
    'geography': ['continent', 'country', 'mountain', 'ocean', 'river', 'climate', 'equator', 'hemisphere', 'latitude', 'longitude', 'map', 'compass'],
    'art': ['painting', 'drawing', 'sculpture', 'artist', 'color', 'design', 'perspective', 'composition', 'texture', 'pattern', 'creativity', 'imagination']
  };
  
  // Default words if subject isn't in our map
  const defaultWords = ['learning', 'education', 'knowledge', 'study', 'practice', 'skill', 'concept', 'understand', 'remember', 'apply', 'create', 'evaluate'];
  
  // Get the appropriate word list, or use default
  const normalizedSubject = subject.toLowerCase();
  let wordList: string[] = [];
  
  for (const key in subjectWords) {
    if (normalizedSubject.includes(key)) {
      wordList = subjectWords[key];
      break;
    }
  }
  
  if (wordList.length === 0) wordList = defaultWords;
  
  // Return either the full list or a random selection if we need fewer words
  if (wordList.length <= count) return wordList;
  
  // Random selection algorithm
  const result: string[] = [];
  const copyList = [...wordList];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * copyList.length);
    result.push(copyList[randomIndex]);
    copyList.splice(randomIndex, 1);
  }
  
  return result;
}

/**
 * Generate clues for a list of words
 */
function getCluesForWords(subject: string, count: number): string[] {
  const words = getMeaningfulWords(subject, count);
  
  // Map of words to generic clues
  const wordClues: Record<string, string> = {
    // Math clues
    'addition': 'The process of combining numbers to find their sum',
    'subtraction': 'The process of finding the difference between numbers',
    'multiplication': 'The process of repeated addition',
    'division': 'The process of splitting into equal parts',
    'fraction': 'A part of a whole, expressed as a numerator and denominator',
    'decimal': 'A number expressed using a period to separate whole and fractional parts',
    'algebra': 'Branch of mathematics using symbols to represent quantities',
    'geometry': 'Branch of mathematics dealing with shapes and spaces',
    'equation': 'Mathematical statement showing equality of two expressions',
    'number': 'A mathematical value used for counting and calculation',
    'pattern': 'A repeating arrangement or sequence',
    'formula': 'A rule expressed with mathematical symbols',
    
    // Science clues
    'experiment': 'A test or investigation to discover something unknown',
    'hypothesis': 'A proposed explanation requiring further testing',
    'observation': 'The act of noticing and recording information',
    'microscope': 'Tool used to see very small objects',
    'molecule': 'A group of atoms bonded together',
    'element': 'Basic substance that cannot be broken down chemically',
    'biology': 'Study of living organisms',
    'chemistry': 'Study of matter and its transformations',
    'physics': 'Study of matter, energy, and their interactions',
    'laboratory': 'Place where scientific research is conducted',
    'research': 'Systematic investigation to establish facts',
    'discovery': 'Finding or learning something for the first time',
    
    // General education clues
    'learning': 'Process of acquiring knowledge or skills',
    'education': 'Systematic instruction to develop knowledge',
    'knowledge': 'Facts, information, and skills acquired through experience',
    'study': 'Devoting time to learn about a subject',
    'practice': 'Repeated exercise to improve a skill',
    'skill': 'Ability to do something well',
    'concept': 'Abstract idea or general notion',
    'understand': 'To comprehend the meaning of something',
    'remember': 'To recall information from memory',
    'apply': 'To put knowledge to practical use',
    'create': 'To bring something into existence',
    'evaluate': 'To assess or determine the value of something'
  };
  
  // Generate clues for each word
  return words.map(word => {
    if (word in wordClues) return wordClues[word];
    return `Related to ${subject}: ${word}`;
  });
}

/**
 * Convert difficulty string to numeric value
 */
function difficultyToNumber(difficulty: string): number {
  switch (difficulty.toLowerCase()) {
    case 'beginner':
      return 3;
    case 'intermediate':
      return 6;
    case 'advanced':
      return 9;
    default:
      return 5;
  }
}

// Generate text using OpenAI's GPT-4o with Anthropic fallback
export async function generateContentWithOpenAI(
  prompt: string,
  responseFormat: "text" | "json_object" = "text",
  maxTokens: number = 4000,
  retries: number = 2
): Promise<string> {
  let currentRetry = 0;
  
  // First try OpenAI with retries
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error generating content with OpenAI (attempt ${currentRetry + 1}/${retries + 1}):`, errorMessage);
      
      // Try to determine if this is a rate limit error (429)
      const isRateLimit = 
        (error && typeof error === 'object' && 'status' in error && error.status === 429) || 
        (errorMessage.includes('429')) || 
        (errorMessage.includes('quota')) ||
        (errorMessage.includes('Quota exceeded')) ||
        (error && typeof error === 'object' && 'error' in error && 
          typeof error.error === 'object' && error.error && 
          'type' in error.error && error.error.type === 'insufficient_quota');
      
      // If it's a quota exhaustion, immediately go to fallback without retrying
      if (errorMessage.includes('exceeded your current quota') || 
          errorMessage.includes('insufficient_quota')) {
        console.log('OpenAI quota exhausted. Switching to Anthropic fallback immediately...');
        break; // Break out of the retry loop and try the fallback
      }
      
      // If we've exhausted retries or it's not a rate limit issue, try Anthropic as fallback
      if (currentRetry >= retries || !isRateLimit) {
        break; // Break out of the retry loop and try the fallback
      }
      
      // If it's a rate limit error and we have retries left, exponential backoff
      if (isRateLimit && currentRetry < retries) {
        const delay = Math.pow(2, currentRetry) * 1000; // Exponential backoff: 1s, 2s, 4s, etc.
        console.log(`OpenAI rate limit exceeded. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        currentRetry++;
      } else {
        break; // Break out of the retry loop and try the fallback
      }
    }
  }
  
  // If we've reached here, all OpenAI attempts failed - try Anthropic as fallback
  if (isAnthropicAvailable()) {
    console.log("OpenAI API quota exceeded or unavailable. Attempting fallback to Anthropic/Claude...");
    try {
      // For regular text generation, use generateCurriculumWithAI
      if (responseFormat === "text") {
        console.log("Using Anthropic curriculum generation for text content");
        const claudeResponse = await generateCurriculumWithAI(prompt);
        console.log("Successfully generated content using Anthropic/Claude fallback");
        return claudeResponse;
      } 
      // For JSON objects, use Claude with a system message to format as JSON
      else if (responseFormat === "json_object") {
        console.log("Using Anthropic virtual tutor for JSON content");
        // Use the virtual tutor with instructions to format as JSON
        const jsonPrompt = `${prompt}\n\nIMPORTANT: Format your response as a valid JSON object without any explanations or additional text.`;
        const claudeResponse = await askVirtualTutor("education", jsonPrompt, "advanced", "structured");
        console.log("Successfully generated JSON using Anthropic/Claude fallback");
        
        // Extract JSON from the response
        const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return jsonMatch[0];
        }
        
        // If no JSON detected, return the raw response
        return claudeResponse;
      }
    } catch (anthropicError) {
      const errorMessage = anthropicError instanceof Error ? anthropicError.message : String(anthropicError);
      console.error("Anthropic fallback failed:", errorMessage);
      throw new Error(`Failed to generate content with both OpenAI and Anthropic: ${errorMessage}`);
    }
  }
  
  // If Anthropic is not available either, give up with an error
  throw new Error(`Failed to generate content: OpenAI API quota exceeded and Anthropic fallback is not available.`);
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
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (nestedParseError) {
            console.warn("Failed to parse extracted JSON:", nestedParseError);
            
            // Try to clean and repair the JSON
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
              return JSON.parse(cleanedJson);
            } catch (finalParseError) {
              console.error("Failed to parse cleaned JSON:", finalParseError);
              
              // Create a minimal valid JSON object as fallback
              console.warn("Creating fallback JSON for activity");
              return {
                title: "Sample Activity",
                description: "This is a placeholder activity.",
                instructions: "Follow the instructions provided by your teacher.",
                content: {
                  questions: ["What is the capital of France?"],
                  words: ["paris", "france", "europe"],
                  clues: ["Capital city", "European country", "Continent"]
                }
              };
            }
          }
        }
        
        // Generate a fallback activity based on the given parameters
        console.warn("Creating fallback educational activity for: " + subject + " - " + activityType);
        return generateFallbackActivity(subject, ageRange, activityType, difficulty);
      }
    } catch (openaiError) {
      console.error("OpenAI service failed (with fallback attempts):", openaiError);
      
      // If everything failed with OpenAI, try direct Anthropic integration
      if (isAnthropicAvailable()) {
        console.log("Attempting direct Anthropic integration for activity generation...");
        try {
          // Using Anthropic directly for educational activity generation
          // We now import askVirtualTutor at the top to avoid circular dependencies
          
          // Create a specialized prompt for Anthropic
          const anthropicPrompt = `
          You are a professional educator with expertise in creating educational content.
          
          Generate a ${difficulty} difficulty ${activityType} about ${subject} for students in the ${ageRange} age range.
          
          Specific instructions: ${instructions}
          
          Reference material: ${knowledgeBaseContent}
          
          Format the response ONLY as a valid JSON object following this structure exactly:
          {
            "title": "Title for the ${activityType}",
            "description": "Description of the ${activityType}",
            "instructions": "Instructions for completing the ${activityType}",
            "content": {}, // See content structure details below
            "targetSkills": ["skill1", "skill2"],
            "ageRange": "${ageRange}",
            "difficulty": "${difficulty}",
            "timeRequired": "Time in minutes"
          }
          
          For the content structure based on activity type:
          
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
          
          I need ONLY the JSON object as a response, with no additional explanation or text. The content must be educational, age-appropriate, and engaging for ${ageRange} students.
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
              
              // Try to clean and repair the JSON
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
                return JSON.parse(cleanedJson);
              } catch (finalParseError) {
                console.error("Failed to parse cleaned Anthropic JSON:", finalParseError);
                
                // Create a minimal valid JSON object as fallback
                console.warn("Creating fallback JSON for activity from Anthropic response");
                return {
                  title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} Activity`,
                  description: `This is a ${activityType} activity about ${subject} for ${ageRange} students.`,
                  instructions: `Follow the instructions provided by your teacher for this ${activityType} activity.`,
                  content: {
                    questions: ["What is the main topic of this lesson?"],
                    words: [subject.toLowerCase(), "learning", "education"],
                    clues: ["Main subject of study", "Process of gaining knowledge", "System of teaching"]
                  }
                };
              }
            }
          } else {
            console.error("Anthropic response did not contain valid JSON");
            
            // Create a minimal valid JSON object as fallback
            console.warn("Creating fallback JSON for activity - no JSON pattern found in Anthropic response");
            return generateFallbackActivity(subject, ageRange, activityType, difficulty);
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