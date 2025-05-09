/**
 * AI Module - Index file
 * Exports all AI-related functionality
 */

// Re-export types and functions from scanner
export { 
  type FileContent,
  type ContentEmbedding,
  extractContentFromFiles,
  extractKeywords,
  generateMockEmbeddings,
  processKnowledgeBase 
} from './scanner';

// Re-export types and functions from semantic
export {
  type SemanticTopic,
  type ConceptRelation,
  type SemanticMap,
  extractTopics,
  identifyConcepts,
  mapConceptRelations,
  extractMainIdeas,
  buildSemanticMap
} from './semantic';

// Re-export types and functions from curriculum-enhancer
export {
  type CurriculumParams,
  type PromptContext,
  extractKnowledgeBaseContext,
  buildEnhancedPrompt,
  enhanceCurriculumGeneration
} from './curriculum-enhancer';