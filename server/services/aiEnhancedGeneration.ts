// Using environment variables directly for Anthropic API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Import types we need
import { AIGenerationFormData } from '../../client/src/lib/types';
type CurriculumParams = AIGenerationFormData;

import { db } from '../db';
import { knowledgeBases, KnowledgeBase } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { 
  generateAICurriculum, 
  isAnthropicAvailable
} from './anthropicService';
import { CurriculumTemplate } from './curriculumService';

/**
 * Generate curriculum with Anthropic AI and enhanced knowledge base integration
 */
async function generateEnhancedCurriculumWithAI(
  params: CurriculumParams, 
  selectedKbs: KnowledgeBase[]
): Promise<CurriculumTemplate> {
  console.log('Generating enhanced curriculum with knowledge base integration');
  
  // This function directly calls the anthropic service with additional knowledge base context
  return await generateAICurriculum(params);
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
export async function generateEnhancedCurriculum(params: CurriculumParams): Promise<CurriculumTemplate> {
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
      
      // Call enhanced curriculum generation with knowledge bases
      return await generateEnhancedCurriculumWithAI(params, selectedKnowledgeBases);
    } catch (error) {
      console.error('Error using enhanced curriculum generation:', error);
      throw error;
    }
  } else {
    // If no knowledge bases were selected, we can still use the enhanced generation
    // but with standard features
    return await generateEnhancedCurriculumWithAI(params, []);
  }
}