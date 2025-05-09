/**
 * Knowledge Base Scanner
 * Advanced content extraction for knowledge base files
 */

// Import types
// Using a relative path to avoid the module resolution issues with the @shared alias
import type { KnowledgeBase } from "../../shared/schema";

// Types for file content and embeddings
export type FileContent = {
  fileName: string;
  mimeType: string;
  content: string;
  metadata?: Record<string, any>;
};

export type ContentEmbedding = {
  fileName: string;
  embedding: number[];
  keywords: string[];
};

/**
 * Deep content scanner for knowledge base files
 * Uses appropriate extraction method based on file type
 */
export async function extractContentFromFiles(files: any[]): Promise<FileContent[]> {
  if (!files || files.length === 0) {
    return [];
  }
  
  const extractedContent: FileContent[] = [];
  
  for (const file of files) {
    try {
      // Extract based on file type
      const fileName = file.name || "unnamed-file";
      const mimeType = file.type || "text/plain";
      let content = '';
      
      // Handle different file types
      if (typeof file.content === 'string') {
        // If content is already available as string, use it directly
        content = file.content;
      } else if (file.text && typeof file.text === 'function') {
        // If there's a text() method (like in File objects)
        content = await file.text();
      } else if (file.content && typeof file.content === 'object') {
        // Attempt to stringify content if it's an object
        try {
          content = JSON.stringify(file.content, null, 2);
        } catch (e) {
          content = "Failed to convert content to string";
        }
      } else {
        // Default case
        content = "Content could not be extracted";
      }
      
      extractedContent.push({
        fileName,
        mimeType,
        content
      });
    } catch (error) {
      console.error(`Error extracting content from file:`, error);
    }
  }
  
  return extractedContent;
}

/**
 * Extract keywords from text content
 * Simple implementation - would be replaced with NLP in full version
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  if (!text || typeof text !== 'string') return [];
  
  // Basic preprocessing
  const cleanedText = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ')     // Replace multiple spaces with a single space
    .trim();
  
  // Split text into words
  const words = cleanedText.split(' ');
  
  // Count word frequency
  const wordFrequency: Record<string, number> = {};
  const stopWords = new Set(['the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'of', 'to', 'for', 'with', 'by', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'if', 'then', 'else', 'when', 'up', 'down', 'out', 'from', 'into', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'this', 'that', 'these', 'those']);
  
  words.forEach(word => {
    if (word.length > 2 && !stopWords.has(word)) {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  });
  
  // Sort words by frequency and take top N
  return Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(entry => entry[0]);
}

/**
 * Generate mock embeddings (placeholder for BERT-based embeddings)
 * In a production system, this would use a proper NLP model
 */
export function generateMockEmbeddings(text: string, dimensions: number = 10): number[] {
  // In a real implementation, this would call a proper embedding model
  // For now, we'll use a simple hash-based approach to generate consistent
  // but meaningless vectors that have some relation to the text content
  
  if (!text) return Array(dimensions).fill(0);
  
  const hash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  };
  
  // Extract keywords to use as basis for embedding
  const keywords = extractKeywords(text, 5);
  
  // Generate a pseudo-random but deterministic vector based on the keywords
  const embedding = Array(dimensions).fill(0);
  keywords.forEach((keyword, idx) => {
    const keywordHash = hash(keyword);
    for (let i = 0; i < dimensions; i++) {
      // Use different math operations to create variation in the embedding
      const value = ((keywordHash * (i + 1)) % 100) / 100;
      embedding[i] += value / (idx + 1); // Divide by index+1 to give earlier keywords more weight
    }
  });
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
}

/**
 * Process knowledge base files to extract content and generate embeddings
 */
export async function processKnowledgeBase(knowledgeBase: KnowledgeBase): Promise<{
  extractedContent: FileContent[],
  embeddings: ContentEmbedding[]
}> {
  try {
    // Prepare files for processing
    let files: any[] = [];
    
    if (knowledgeBase.files && Array.isArray(knowledgeBase.files)) {
      // If files are available directly as an array
      files = knowledgeBase.files;
    } else if (knowledgeBase.files && typeof knowledgeBase.files === 'object') {
      // If files is an object but not an array, wrap it
      files = [knowledgeBase.files];
    } else if (knowledgeBase.description) {
      // If no files but we have a description, use that as content
      files = [{
        name: `${knowledgeBase.title}.txt`,
        type: 'text/plain',
        content: knowledgeBase.description
      }];
    } else {
      console.warn(`Knowledge base ${knowledgeBase.id} has no files or content`);
      return { extractedContent: [], embeddings: [] };
    }
    
    // Extract content from files
    const extractedContent = await extractContentFromFiles(files);
    
    // Generate embeddings and extract keywords
    const embeddings: ContentEmbedding[] = extractedContent.map(fileContent => ({
      fileName: fileContent.fileName,
      embedding: generateMockEmbeddings(fileContent.content),
      keywords: extractKeywords(fileContent.content, 10)
    }));
    
    return { extractedContent, embeddings };
  } catch (error) {
    console.error(`Error processing knowledge base ${knowledgeBase.id}:`, error);
    return { extractedContent: [], embeddings: [] };
  }
}