/**
 * Semantic Understanding Module
 * Provides tools for analyzing and understanding knowledge base content
 */

import { ContentEmbedding, FileContent } from './scanner';

// Types for semantic analysis
export type SemanticTopic = {
  topicId: number;
  keywords: string[];
  relevance: number;  // 0-1 scale
};

export type ConceptRelation = {
  sourceConcept: string;
  targetConcept: string;
  relationStrength: number;  // 0-1 scale
  relationType: 'prerequisite' | 'similar' | 'related' | 'builds-on';
};

export type SemanticMap = {
  topics: SemanticTopic[];
  concepts: string[];
  relations: ConceptRelation[];
  mainIdeas: string[];
};

/**
 * Extract topics from file content
 * Simplified implementation of topic modeling (LDA)
 */
export function extractTopics(
  contentList: FileContent[],
  embeddings: ContentEmbedding[],
  topicCount: number = 5
): SemanticTopic[] {
  if (contentList.length === 0) return [];
  
  // In a real implementation, this would use LDA or another topic modeling algorithm
  // For this simplified version, we'll group by keywords
  
  // Collect all keywords
  const allKeywords = new Set<string>();
  embeddings.forEach(emb => {
    emb.keywords.forEach(keyword => allKeywords.add(keyword));
  });
  
  // Create topics based on keyword similarity
  const topics: SemanticTopic[] = [];
  const keywordsArray = Array.from(allKeywords);
  
  // Create topics with unique keywords
  for (let i = 0; i < Math.min(topicCount, Math.ceil(keywordsArray.length / 3)); i++) {
    const startIdx = i * 3;
    const endIdx = Math.min(startIdx + 3, keywordsArray.length);
    const topicKeywords = keywordsArray.slice(startIdx, endIdx);
    
    if (topicKeywords.length > 0) {
      topics.push({
        topicId: i + 1,
        keywords: topicKeywords,
        relevance: 1 - (i / topicCount)  // First topics are more relevant
      });
    }
  }
  
  return topics;
}

/**
 * Identify key concepts from content and embeddings
 */
export function identifyConcepts(
  contentList: FileContent[],
  embeddings: ContentEmbedding[]
): string[] {
  if (contentList.length === 0) return [];
  
  // Collect keywords from all files
  const keywordCount: Record<string, number> = {};
  embeddings.forEach(emb => {
    emb.keywords.forEach(keyword => {
      keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
    });
  });
  
  // Select keywords that appear in multiple files as concepts
  return Object.entries(keywordCount)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([keyword]) => keyword);
}

/**
 * Determine relationships between concepts
 */
export function mapConceptRelations(
  concepts: string[],
  contentList: FileContent[]
): ConceptRelation[] {
  if (concepts.length < 2) return [];
  
  const relations: ConceptRelation[] = [];
  
  // Check which concepts appear together in files
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const sourceFiles = contentList.filter(file => 
        file.content.toLowerCase().includes(concepts[i].toLowerCase())
      );
      
      const commonFiles = sourceFiles.filter(file => 
        file.content.toLowerCase().includes(concepts[j].toLowerCase())
      );
      
      // If concepts appear together, create a relation
      if (commonFiles.length > 0) {
        const relationStrength = commonFiles.length / Math.max(1, sourceFiles.length);
        
        // Determine relation type based on text analysis
        // This is simplified; a real implementation would use NLP
        let relationType: ConceptRelation['relationType'] = 'related';
        const sampleContent = commonFiles[0].content.toLowerCase();
        if (sampleContent.includes('prerequisite') || 
            sampleContent.includes('before') || 
            sampleContent.includes('required')) {
          relationType = 'prerequisite';
        } else if (sampleContent.includes('similar') || 
                   sampleContent.includes('like') || 
                   sampleContent.includes('same')) {
          relationType = 'similar';
        } else if (sampleContent.includes('build') || 
                   sampleContent.includes('advanced') || 
                   sampleContent.includes('next')) {
          relationType = 'builds-on';
        }
        
        relations.push({
          sourceConcept: concepts[i],
          targetConcept: concepts[j],
          relationStrength,
          relationType
        });
      }
    }
  }
  
  return relations;
}

/**
 * Extract main ideas from content
 */
export function extractMainIdeas(contentList: FileContent[]): string[] {
  if (contentList.length === 0) return [];
  
  // In a real implementation, this would use more sophisticated NLP
  // Here we'll use a simple heuristic based on sentence importance
  
  const sentences: {text: string, score: number}[] = [];
  
  // Extract sentences from all content
  contentList.forEach(file => {
    const text = file.content;
    const sentenceMatches = text.match(/[^.!?]+[.!?]+/g) || [];
    
    sentenceMatches.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed.split(' ').length > 5) {  // Ignore very short sentences
        // Score based on position (earlier = more important) and length
        const positionScore = 1.0;  // All equal for now
        const lengthScore = Math.min(1.0, trimmed.split(' ').length / 20);
        const score = positionScore * 0.6 + lengthScore * 0.4;
        
        sentences.push({text: trimmed, score});
      }
    });
  });
  
  // Sort by score and take top sentences as main ideas
  return sentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.text);
}

/**
 * Build complete semantic map from knowledge base content
 */
export function buildSemanticMap(
  contentList: FileContent[],
  embeddings: ContentEmbedding[]
): SemanticMap {
  // Extract topics
  const topics = extractTopics(contentList, embeddings);
  
  // Identify key concepts
  const concepts = identifyConcepts(contentList, embeddings);
  
  // Map concept relationships
  const relations = mapConceptRelations(concepts, contentList);
  
  // Extract main ideas
  const mainIdeas = extractMainIdeas(contentList);
  
  return {
    topics,
    concepts,
    relations,
    mainIdeas
  };
}