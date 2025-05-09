/**
 * AI Curriculum Enhancer
 * Integrates knowledge base content with AI curriculum generation
 */

// Using relative path to avoid module resolution issues
import type { KnowledgeBase } from '../../shared/schema';
import { processKnowledgeBase } from './scanner';
import { buildSemanticMap, SemanticMap } from './semantic';

// Type for curriculum generation parameters
export type CurriculumParams = {
  subject: string;
  gradeLevel: string;
  learningStyles: string[];
  additionalDetails?: string;
  knowledgeBaseIds?: number[];
};

// Type for enhanced prompt context
export type PromptContext = {
  knowledgeBaseInfo: string;
  keyTopics: string[];
  keyConcepts: string[];
  mainIdeas: string[];
  contentExcerpts: string[];
  semanticMap?: SemanticMap;
};

/**
 * Process knowledge bases to extract information for curriculum generation
 */
export async function extractKnowledgeBaseContext(
  knowledgeBases: KnowledgeBase[]
): Promise<PromptContext> {
  if (!knowledgeBases || knowledgeBases.length === 0) {
    return {
      knowledgeBaseInfo: '',
      keyTopics: [],
      keyConcepts: [],
      mainIdeas: [],
      contentExcerpts: []
    };
  }

  console.log(`Processing ${knowledgeBases.length} knowledge bases for context extraction`);
  
  // Process each knowledge base
  const allContentList = [];
  const allEmbeddings = [];
  let knowledgeBaseInfo = '';
  
  for (const kb of knowledgeBases) {
    // Process files and extract content/embeddings
    const { extractedContent, embeddings } = await processKnowledgeBase(kb);
    allContentList.push(...extractedContent);
    allEmbeddings.push(...embeddings);
    
    // Basic knowledge base info
    knowledgeBaseInfo += `Knowledge Base: "${kb.title}"\n`;
    
    // Extract metadata if available
    if (kb.metadata) {
      try {
        const metadata = typeof kb.metadata === 'string' 
          ? JSON.parse(kb.metadata) 
          : kb.metadata;
        
        // Extract objectives
        if (metadata.objectives && Array.isArray(metadata.objectives)) {
          knowledgeBaseInfo += "Objectives:\n";
          metadata.objectives.forEach((obj: string) => {
            knowledgeBaseInfo += `- ${obj}\n`;
          });
        }
        
        // Extract tags
        if (metadata.tags && Array.isArray(metadata.tags)) {
          knowledgeBaseInfo += "Tags: " + metadata.tags.join(", ") + "\n";
        }
      } catch (e) {
        console.warn(`Error parsing metadata for knowledge base ${kb.title}:`, e);
      }
    }
    
    knowledgeBaseInfo += "\n";
  }
  
  // Build semantic map from all content
  const semanticMap = buildSemanticMap(allContentList, allEmbeddings);
  
  // Extract key topics from semantic map
  const keyTopics = semanticMap.topics.map(topic => topic.keywords.join(', '));
  
  // Extract key concepts
  const keyConcepts = semanticMap.concepts;
  
  // Extract main ideas
  const mainIdeas = semanticMap.mainIdeas;
  
  // Extract representative content excerpts
  const contentExcerpts = allContentList
    .map(file => {
      // Take a snippet of the content (first 250 chars)
      const snippet = file.content.substring(0, 250).trim();
      if (snippet.length >= 100) {  // Only include substantial excerpts
        return `From ${file.fileName}: "${snippet}${snippet.length < file.content.length ? '...' : ''}"`;
      }
      return null;
    })
    .filter(Boolean) as string[];
  
  return {
    knowledgeBaseInfo,
    keyTopics,
    keyConcepts,
    mainIdeas,
    contentExcerpts,
    semanticMap
  };
}

/**
 * Build enhanced prompt with knowledge base context
 */
export function buildEnhancedPrompt(
  params: CurriculumParams, 
  context: PromptContext
): string {
  const { subject, gradeLevel, learningStyles, additionalDetails } = params;
  
  // Start with core prompt
  let prompt = `Generate a comprehensive curriculum for ${subject} for ${gradeLevel} students.\n`;
  prompt += `This curriculum should incorporate the following learning styles: ${learningStyles.join(', ')}.\n`;
  
  if (additionalDetails) {
    prompt += `Consider these additional requirements: ${additionalDetails}\n\n`;
  }
  
  // Add knowledge base context if available
  if (context.knowledgeBaseInfo) {
    prompt += `Based on the following knowledge base materials:\n\n${context.knowledgeBaseInfo}\n`;
    
    // Add key topics
    if (context.keyTopics.length > 0) {
      prompt += `Key topics from these materials include:\n`;
      context.keyTopics.forEach(topic => {
        prompt += `- ${topic}\n`;
      });
      prompt += '\n';
    }
    
    // Add key concepts
    if (context.keyConcepts.length > 0) {
      prompt += `Important concepts to cover:\n`;
      context.keyConcepts.forEach(concept => {
        prompt += `- ${concept}\n`;
      });
      prompt += '\n';
    }
    
    // Add main ideas
    if (context.mainIdeas.length > 0) {
      prompt += `Main ideas to incorporate:\n`;
      context.mainIdeas.forEach(idea => {
        prompt += `- ${idea}\n`;
      });
      prompt += '\n';
    }
    
    // Add content excerpts
    if (context.contentExcerpts.length > 0) {
      prompt += `Representative content excerpts:\n`;
      // Limit to 3 excerpts to keep prompt size reasonable
      context.contentExcerpts.slice(0, 3).forEach(excerpt => {
        prompt += `${excerpt}\n`;
      });
      prompt += '\n';
    }
  }
  
  // Add formatting instructions
  prompt += `Format your response as a JSON object with this structure:
{
  "title": "title of the curriculum",
  "description": "comprehensive overview of the curriculum",
  "objectives": ["learning objective 1", "learning objective 2", ...],
  "units": [
    {
      "title": "unit title",
      "description": "description of the unit",
      "lessons": [
        {
          "title": "lesson title",
          "description": "lesson description",
          "duration": 45,
          "activities": ["activity 1", "activity 2", ...],
          "resources": ["resource 1", "resource 2", ...],
          "assessments": ["assessment 1", "assessment 2", ...]
        }
      ]
    }
  ]
}`;

  return prompt;
}

/**
 * Enhance curriculum generation with knowledge base content
 */
export async function enhanceCurriculumGeneration(
  params: CurriculumParams,
  knowledgeBases: KnowledgeBase[]
): Promise<string> {
  // Extract context from knowledge bases
  const context = await extractKnowledgeBaseContext(knowledgeBases);
  
  // Build enhanced prompt
  const enhancedPrompt = buildEnhancedPrompt(params, context);
  
  console.log('Enhanced prompt created with knowledge base context');
  
  return enhancedPrompt;
}