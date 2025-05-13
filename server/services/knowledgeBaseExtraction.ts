/**
 * Knowledge Base Extraction Service
 * Provides functions to extract and process content from knowledge bases for AI integration
 */

import { KnowledgeBase } from '@shared/schema';
import { anthropicService } from './anthropic';

/**
 * Extract entities from text using simple pattern matching
 * @param text The text to analyze
 * @returns Array of extracted entities with their types
 */
export async function extractEntities(text: string): Promise<Array<{text: string, type: string}>> {
  try {
    // Simple implementation using regular expressions
    const entities: Array<{text: string, type: string}> = [];
    
    // Regular expressions for entity types
    const patterns = {
      PERSON: /\b([A-Z][a-z]+ (?:[A-Z][a-z]+ )?[A-Z][a-z]+)\b/g,
      LOCATION: /\b([A-Z][a-z]+ (?:Island|Mountain|River|Ocean|Sea|Lake|Forest|Desert|City|Country|State|Province|Town|Village))\b/g,
      ORGANIZATION: /\b([A-Z][a-z]+ (?:Company|Corporation|Inc|LLC|Association|Foundation|Institute|University|College|School))\b/g,
      DATE: /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
      EVENT: /\b([A-Z][a-z]+ (?:War|Revolution|Battle|Movement|Election|Conference|Summit))\b/g,
    };
    
    // Process each pattern
    Object.entries(patterns).forEach(([type, pattern]) => {
      // Convert to string for matching
      const textStr = String(text);
      // Use standard string methods instead of matchAll for compatibility
      let match;
      const regex = new RegExp(pattern);
      while ((match = regex.exec(textStr)) !== null) {
        if (match[1]) {
          entities.push({
            text: match[1],
            type
          });
        }
      }
    });
    
    return entities;
  } catch (error) {
    console.error('Error extracting entities:', error);
    return [];
  }
}

/**
 * Summarize text using Anthropic/Claude for better understanding
 * @param text The text to summarize
 * @param targetAudience The target audience for the summary (e.g., "elementary school")
 * @returns Summarized text
 */
export async function summarizeText(text: string, targetAudience: string): Promise<string> {
  try {
    // Use Claude for summarization when available
    const prompt = `Summarize the following text for ${targetAudience} students. Make it clear, educational, and engaging:
    
    ${text.slice(0, 3000)} // Limit text to first 3000 chars to avoid token limits
    
    Summary:`;
    
    const summary = await anthropicService.generateContent(prompt);
    return summary || text.slice(0, 300); // Fallback to simple truncation
  } catch (error) {
    console.error('Error summarizing text:', error);
    return text.slice(0, 300); // Fallback to simple truncation on error
  }
}

/**
 * Generate educational questions based on content
 * @param summary The text summary to base questions on
 * @param entities Extracted entities from the text
 * @param subject The subject area
 * @param ageRange The target age range
 * @returns Array of question objects
 */
export async function generateQuestions(
  summary: string, 
  entities: Array<{text: string, type: string}>, 
  subject: string,
  ageRange: string
): Promise<Array<{question: string, answer: string, type: string}>> {
  try {
    // Extract entity names for context
    const entityNames = entities
      .filter(e => ['PERSON', 'ORGANIZATION', 'LOCATION', 'EVENT'].includes(e.type))
      .map(e => e.text);
    
    // Determine age-appropriate complexity
    let maxAge = 10; // Default to middle
    try {
      const ageRangeParts = ageRange.split('-');
      maxAge = ageRangeParts.length > 1 
        ? parseInt(ageRangeParts[1]) 
        : parseInt(ageRangeParts[0]);
    } catch (parseError) {
      console.warn('Could not parse age range:', ageRange);
    }
    
    const complexity = maxAge <= 8 ? 'simple' : maxAge <= 12 ? 'moderate' : 'advanced';
    
    // Generate questions using Claude
    const entitiesContext = entityNames.length > 0 
      ? `Include references to these important names/terms when relevant: ${entityNames.join(', ')}.` 
      : '';
    
    const prompt = `Generate ${complexity} comprehension questions about ${subject} based on this summary: 
    
    ${summary}
    
    ${entitiesContext}
    
    Create 3-5 age-appropriate questions for ${ageRange} year old students. For each question, provide the question text and the expected answer.
    
    Return the questions in JSON format with this structure:
    [
      {
        "question": "Question text here?",
        "answer": "Expected answer here",
        "type": "comprehension" or "knowledge" or "application"
      }
    ]`;
    
    const questionsJson = await anthropicService.generateContent(prompt, true);
    
    if (questionsJson) {
      try {
        const questions = JSON.parse(questionsJson);
        if (Array.isArray(questions) && questions.length > 0) {
          return questions;
        }
      } catch (parseError) {
        console.error('Error parsing generated questions:', parseError);
      }
    }
    
    // Fallback questions if generation or parsing fails
    return [
      {
        question: `What is the main topic of this ${subject} text?`,
        answer: 'To be filled by teacher',
        type: 'comprehension'
      },
      {
        question: 'What are the key points mentioned in the text?',
        answer: 'To be filled by teacher',
        type: 'comprehension'
      },
      {
        question: 'How would you apply what you learned from this text?',
        answer: 'To be filled by teacher',
        type: 'application'
      }
    ];
  } catch (error) {
    console.error('Error generating questions:', error);
    
    // Fallback in case of error
    return [
      {
        question: `What have you learned about ${subject}?`,
        answer: 'To be filled by teacher',
        type: 'comprehension'
      },
      {
        question: 'What did you find most interesting?',
        answer: 'To be filled by teacher',
        type: 'application'
      }
    ];
  }
}

/**
 * Process knowledge base content for enhanced semantic understanding
 * @param knowledgeBases Array of knowledge base objects
 * @param subject Target subject
 * @param ageRange Target age range 
 * @returns Processed content with enhanced semantic information
 */
/**
 * Extract content from an array of knowledge base objects
 * @param knowledgeBases Array of knowledge base objects
 * @returns Formatted content as a string
 */
export function extractKnowledgeBaseContent(knowledgeBases: any[]): string {
  try {
    if (!knowledgeBases || knowledgeBases.length === 0) {
      return "";
    }
    
    // Combine content from all knowledge bases
    let combinedContent = '';
    for (const kb of knowledgeBases) {
      // Handle different knowledge base properties based on the actual schema
      const title = kb.title || 'Untitled';
      const kbSubject = kb.subject || 'General';
      
      // Extract content from metadata or files field
      let contentText = '';
      
      if (kb.metadata) {
        contentText = typeof kb.metadata === 'object' ? JSON.stringify(kb.metadata) : kb.metadata.toString();
      } else if (kb.files) {
        contentText = typeof kb.files === 'object' ? JSON.stringify(kb.files) : kb.files.toString();
      } else if (kb.description) {
        contentText = kb.description;
      }
      
      combinedContent += `KNOWLEDGE BASE: ${title}\nSUBJECT: ${kbSubject}\n\nCONTENT:\n${contentText}\n\n`;
    }
    
    return combinedContent;
  } catch (error) {
    console.error('Error extracting knowledge base content:', error);
    return "";
  }
}

/**
 * Extract key concepts from knowledge bases
 * @param knowledgeBases Array of knowledge base objects
 * @returns Object containing extracted topics, key terms, and main ideas
 */
export function extractKeyConceptsFromKnowledgeBases(knowledgeBases: any[]): {
  topics: string[],
  keyTerms: string[],
  mainIdeas: string[]
} {
  try {
    if (!knowledgeBases || knowledgeBases.length === 0) {
      return {
        topics: [],
        keyTerms: [],
        mainIdeas: []
      };
    }
    
    const topics = new Set<string>();
    const keyTerms = new Set<string>();
    const mainIdeas = new Set<string>();
    
    // Process each knowledge base
    for (const kb of knowledgeBases) {
      // Extract subject as a topic
      if (kb.subject) {
        topics.add(kb.subject);
      }
      
      // Extract topics from title
      if (kb.title) {
        const titleWords = kb.title.split(/\s+/).filter((word: string) => word.length > 3);
        titleWords.forEach((word: string) => {
          if (word.length > 0 && /^[A-Z]/.test(word)) {
            topics.add(word);
          }
        });
      }
      
      // Extract key terms from metadata if available
      if (kb.metadata) {
        let metadataStr = '';
        try {
          metadataStr = typeof kb.metadata === 'object' ? JSON.stringify(kb.metadata) : String(kb.metadata);
          
          // Extract capitalized terms as potential key concepts
          const capitalizedTerms = metadataStr.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [];
          capitalizedTerms.forEach(term => keyTerms.add(term));
          
          // Extract potential main ideas (sentences with key indicator phrases)
          const mainIdeaIndicators = [
            'important', 'significant', 'key', 'main', 'central', 
            'critical', 'essential', 'fundamental', 'primary'
          ];
          
          const sentences = metadataStr.split(/[.!?]+/).filter(s => s.trim().length > 0);
          sentences.forEach(sentence => {
            for (const indicator of mainIdeaIndicators) {
              if (sentence.toLowerCase().includes(indicator)) {
                mainIdeas.add(sentence.trim());
                break;
              }
            }
          });
        } catch (parseError) {
          console.warn('Error parsing metadata for key concepts:', parseError);
        }
      }
      
      // Also look for key terms in description
      if (kb.description) {
        const descriptionWords = kb.description.split(/\s+/).filter((word: string) => 
          word.length > 3 && /^[A-Z]/.test(word)
        );
        descriptionWords.forEach((word: string) => keyTerms.add(word));
      }
    }
    
    return {
      topics: Array.from(topics),
      keyTerms: Array.from(keyTerms),
      mainIdeas: Array.from(mainIdeas)
    };
  } catch (error) {
    console.error('Error extracting key concepts:', error);
    return {
      topics: [],
      keyTerms: [],
      mainIdeas: []
    };
  }
}

export async function processKnowledgeBases(
  knowledgeBases: any[],  // Using any type to accommodate the actual schema
  subject: string,
  ageRange: string
): Promise<{
  summary: string,
  entities: Array<{text: string, type: string}>,
  questions: Array<{question: string, answer: string, type: string}>,
  enrichedContent: string
}> {
  try {
    if (!knowledgeBases || knowledgeBases.length === 0) {
      return {
        summary: `No knowledge base content available for ${subject}.`,
        entities: [],
        questions: [],
        enrichedContent: ''
      };
    }
    
    // Combine content from all knowledge bases
    let combinedContent = '';
    for (const kb of knowledgeBases) {
      // Handle different knowledge base properties based on the actual schema
      const title = kb.title || 'Untitled';
      const kbSubject = kb.subject || subject;
      
      // Extract content from metadata or files field
      let contentText = '';
      
      if (kb.metadata) {
        contentText = typeof kb.metadata === 'object' ? JSON.stringify(kb.metadata) : kb.metadata.toString();
      } else if (kb.files) {
        contentText = typeof kb.files === 'object' ? JSON.stringify(kb.files) : kb.files.toString();
      } else if (kb.description) {
        contentText = kb.description;
      }
      
      combinedContent += `KNOWLEDGE BASE: ${title}\nSUBJECT: ${kbSubject}\n\nCONTENT:\n${contentText}\n\n`;
    }
    
    // Extract entities from the combined content
    const entities = await extractEntities(combinedContent);
    
    // Get age-appropriate audience description
    let audienceLevel = 'elementary school';
    try {
      const ageRangeParts = ageRange.split('-');
      const maxAge = ageRangeParts.length > 1 
        ? parseInt(ageRangeParts[1]) 
        : parseInt(ageRangeParts[0]);
      
      if (maxAge > 10) audienceLevel = 'middle school';
      if (maxAge > 13) audienceLevel = 'high school';
    } catch (parseError) {
      console.warn('Could not parse age range, defaulting to elementary school:', ageRange);
    }
    
    // Generate summary of the content
    const summary = await summarizeText(combinedContent, audienceLevel);
    
    // Generate questions based on summary and entities
    const questions = await generateQuestions(summary, entities, subject, ageRange);
    
    // Create enriched content with semantic understanding
    const enrichedContent = `
SUBJECT: ${subject}
TARGET AGE: ${ageRange}
AUDIENCE LEVEL: ${audienceLevel}

SUMMARY:
${summary}

KEY ENTITIES:
${entities.map(e => `- ${e.text} (${e.type})`).join('\n')}

SUGGESTED QUESTIONS:
${questions.map(q => `- ${q.question}\n  Answer: ${q.answer}`).join('\n\n')}

ORIGINAL CONTENT:
${combinedContent}
    `;
    
    return {
      summary,
      entities,
      questions,
      enrichedContent
    };
  } catch (error) {
    console.error('Error processing knowledge bases:', error);
    return {
      summary: `Error processing knowledge base content for ${subject}.`,
      entities: [],
      questions: [],
      enrichedContent: ''
    };
  }
}