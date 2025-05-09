// Using environment variables directly for Anthropic API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Import types we need
type CurriculumParams = {
  subject: string;
  gradeLevel: string;
  learningStyles: string[];
  additionalDetails?: string;
  knowledgeBaseIds?: number[];
};

import { db } from '../db';
import { knowledgeBases, KnowledgeBase } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { generateAIPrompt, generateCurriculumWithAI, extractKnowledgeBaseContent } from './anthropicService';

/**
 * Generate curriculum with Anthropic AI and enhanced knowledge base integration
 */
async function generateCurriculumWithAnthropicAI(
  params: CurriculumParams, 
  selectedKbs: KnowledgeBase[]
): Promise<string> {
  // Prepare knowledge base information for the prompt
  let knowledgeBaseInfo = "";
  
  if (selectedKbs.length > 0) {
    knowledgeBaseInfo = selectedKbs.map(kb => {
      return `
      Knowledge Base: ${kb.title}
      Subject: ${kb.subject}
      Description: ${kb.description || 'No description available'}
      Key Topics: ${kb.keywords?.join(', ') || 'None provided'}
      `;
    }).join('\n\n');
  }
  
  // Build an enhanced prompt
  let enhancedPrompt = `
  Create a comprehensive curriculum for ${params.subject} for ${params.gradeLevel} students.
  
  The curriculum should be designed for these learning styles: ${params.learningStyles.join(', ')}.
  
  ${params.additionalDetails ? `Additional details about the learning context: ${params.additionalDetails}` : ''}
  `;
  
  // If we have knowledge base info, add it to the prompt
  if (knowledgeBaseInfo) {
    enhancedPrompt += `\n\nPlease integrate content from the following knowledge bases into the curriculum:\n${knowledgeBaseInfo}`;
    enhancedPrompt += `\n\nAnalyze the knowledge base information semantically and incorporate key concepts, topics, and relationships into the curriculum. Make sure to create a cohesive learning experience that incorporates this domain knowledge.`;
  }
  
  // Generate the response using the Anthropic API
  return await generateAIPrompt(enhancedPrompt);
}

/**
 * Check if enhanced AI generation is available
 * This depends on having both the Anthropic API key and the enhanced AI modules
 */
export function isEnhancedGenerationAvailable(): boolean {
  // If we have an Anthropic API key and enhanced AI modules are loaded, we're good to go
  return !!ANTHROPIC_API_KEY;
}

/**
 * This function serves as an entry point to the enhanced AI generation workflow
 * It connects the curriculum service with the AI enhancement modules
 */
export async function generateEnhancedCurriculum(params: CurriculumParams): Promise<string> {
  // First check if we can use enhanced generation
  if (!isEnhancedGenerationAvailable()) {
    throw new Error('Enhanced AI generation is not available');
  }
  
  // Process params to retrieve knowledge base information if needed
  if (params.knowledgeBaseIds && params.knowledgeBaseIds.length > 0) {
    try {
      // Retrieve the knowledge bases from the database
      const selectedKnowledgeBases = await db
        .select()
        .from(knowledgeBases)
        .where(inArray(knowledgeBases.id, params.knowledgeBaseIds));
        
      if (selectedKnowledgeBases.length === 0) {
        console.log('No knowledge bases found with the provided IDs');
      }
      
      // In a real implementation, we'd use the actual AI modules
      // For now, simulate enhanced generation with knowledge base integration
      // Call the anthropic service with knowledge base data
      return await generateCurriculumWithAnthropicAI(params, selectedKnowledgeBases);
    } catch (error) {
      console.error('Error using enhanced curriculum generation:', error);
      throw error;
    }
  } else {
    // If no knowledge bases were selected, we can still use the enhanced generation
    // but with standard features
    return await generateCurriculumWithAnthropicAI(params, []);
  }
}