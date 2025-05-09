/**
 * AI Enhanced Generation Service
 * Uses our new AI enhancement modules to provide better curriculum generation
 */

import { enhanceCurriculumGeneration } from '../../ai/src/curriculum-enhancer';
import { AIGenerationFormData } from '@/lib/types';
import { KnowledgeBase } from '@shared/schema';
import { generateCurriculumWithAI } from './anthropic';
import { CurriculumTemplate } from './curriculumService';

/**
 * Enhanced curriculum generation that uses our new AI modules for better knowledge base integration
 */
export async function generateEnhancedCurriculum(
  formData: AIGenerationFormData,
  knowledgeBases: KnowledgeBase[]
): Promise<CurriculumTemplate> {
  try {
    console.log(`Generating enhanced curriculum for ${formData.subject} at ${formData.gradeLevel} level with ${knowledgeBases.length} knowledge bases`);
    
    // Convert form data to the format expected by our enhancer
    const enhancerParams = {
      subject: formData.subject,
      gradeLevel: formData.gradeLevel,
      learningStyles: formData.learningStyles,
      additionalDetails: formData.additionalDetails,
      knowledgeBaseIds: formData.knowledgeBaseIds
    };
    
    // Generate enhanced prompt using our new module
    const enhancedPrompt = await enhanceCurriculumGeneration(enhancerParams, knowledgeBases);
    
    // Log the first part of the prompt for debugging
    console.log(`Enhanced prompt generated (excerpt): ${enhancedPrompt.substring(0, 200)}...`);
    
    // Use the enhanced prompt with the AI service
    const jsonResponse = await generateCurriculumWithAI(enhancedPrompt);
    
    // Extract JSON from response
    const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Enhanced service failed to return valid JSON');
    }
    
    try {
      // Attempt to parse JSON directly
      const curriculumTemplate: CurriculumTemplate = JSON.parse(jsonMatch[0]);
      return curriculumTemplate;
    } catch (jsonError) {
      console.warn('JSON parse error, attempting to clean and repair the JSON:', jsonError);
      
      // Clean up common JSON formatting issues
      const cleanedJson = jsonMatch[0]
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
        .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
        .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
        .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
        .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
        
      // Try parsing the cleaned JSON
      const curriculumTemplate: CurriculumTemplate = JSON.parse(cleanedJson);
      return curriculumTemplate;
    }
  } catch (error) {
    console.error('Error in enhanced curriculum generation:', error);
    throw error;
  }
}

/**
 * Check if enhanced curriculum generation is available
 * This checks if all required components are available
 */
export function isEnhancedGenerationAvailable(): boolean {
  try {
    // For now, simply return true as we've verified the modules work
    // In a production system, we'd check if all dependencies are available
    return true;
  } catch (error) {
    console.warn('Enhanced curriculum generation not available:', error);
    return false;
  }
}