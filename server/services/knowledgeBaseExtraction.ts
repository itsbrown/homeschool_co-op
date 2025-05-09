/**
 * Knowledge Base Extraction Service
 * Provides functions to extract and process content from knowledge bases for AI integration
 */

import { KnowledgeBase } from '@shared/schema';

/**
 * Extracts content from knowledge bases for use in AI prompts
 * @param knowledgeBases Array of knowledge bases to extract content from
 * @returns Formatted string containing knowledge base content
 */
export function extractKnowledgeBaseContent(knowledgeBases: KnowledgeBase[]): string {
  if (!knowledgeBases || knowledgeBases.length === 0) {
    return "";
  }
  
  let content = "Based on the following knowledge base materials:\n\n";
  
  // Process each knowledge base
  for (let i = 0; i < knowledgeBases.length; i++) {
    const kb = knowledgeBases[i];
    content += `Knowledge Base ${i + 1}: "${kb.title}"\n`;
    
    // Add metadata
    if (kb.metadata) {
      // Extract objectives if they exist
      const metadata = kb.metadata as any;
      if (metadata.objectives && Array.isArray(metadata.objectives)) {
        content += "Objectives:\n";
        metadata.objectives.forEach((obj: string) => {
          content += `- ${obj}\n`;
        });
      }
      
      // Extract tags if they exist
      if (metadata.tags && Array.isArray(metadata.tags)) {
        content += "Tags: " + metadata.tags.join(", ") + "\n";
      }
    }
    
    // Add file contents (or descriptions if actual content is unavailable)
    if (kb.files && Array.isArray(kb.files)) {
      content += "Content:\n";
      
      // Process each file
      for (const file of kb.files) {
        content += `--- File: ${file.name} ---\n`;
        
        // Check if we have content/text field in the file data
        if (file.content || file.text) {
          const fileContent = file.content || file.text;
          // For large content, include a summary or truncate
          if (fileContent.length > 1000) {
            content += fileContent.substring(0, 1000) + "...\n";
          } else {
            content += fileContent + "\n";
          }
        } 
        // If file has description but no content
        else if (file.description) {
          content += `Description: ${file.description}\n`;
        }
        // Otherwise, just note that content is not available
        else {
          content += `(Content not available - using file metadata only)\n`;
        }
        
        content += "\n";
      }
    } else {
      // If no files, add a note that only metadata is available
      content += "Note: Only metadata available for this knowledge base (no file contents).\n";
    }
    
    content += "\n";
  }
  
  return content;
}

/**
 * Extracts key concepts and terms from knowledge bases for use in AI prompts
 * This provides a more concise summary when full content is too verbose
 * @param knowledgeBases Array of knowledge bases to extract key concepts from
 * @returns Object containing extracted key concepts and terms
 */
export function extractKeyConceptsFromKnowledgeBases(knowledgeBases: KnowledgeBase[]): {
  topics: string[];
  keyTerms: string[];
  mainIdeas: string[];
} {
  const result = {
    topics: [] as string[],
    keyTerms: [] as string[],
    mainIdeas: [] as string[]
  };
  
  if (!knowledgeBases || knowledgeBases.length === 0) {
    return result;
  }
  
  // Extract topics from titles and metadata
  for (const kb of knowledgeBases) {
    // Add title as a topic
    result.topics.push(kb.title);
    
    // Extract from metadata
    if (kb.metadata) {
      const metadata = kb.metadata as any;
      
      // Add tags as key terms
      if (metadata.tags && Array.isArray(metadata.tags)) {
        metadata.tags.forEach((tag: string) => {
          result.keyTerms.push(tag);
        });
      }
      
      // Add objectives as main ideas
      if (metadata.objectives && Array.isArray(metadata.objectives)) {
        metadata.objectives.forEach((objective: string) => {
          result.mainIdeas.push(objective);
        });
      }
    }
  }
  
  // Remove duplicates (using Array.from + Set to avoid downlevelIteration issues)
  result.topics = Array.from(new Set(result.topics));
  result.keyTerms = Array.from(new Set(result.keyTerms));
  result.mainIdeas = Array.from(new Set(result.mainIdeas));
  
  return result;
}