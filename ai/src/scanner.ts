/**
 * Knowledge Base Scanner
 * Advanced content extraction for knowledge base files
 */

import { KnowledgeBase } from '@shared/schema';

// Types for extracted content and embeddings
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
      const fileName = file.name || 'unnamed';
      const mimeType = file.type || 'text/plain';
      let content = '';
      
      if (typeof file === 'object') {
        // Handle different content storage formats
        if (file.content) {
          content = typeof file.content === 'string' 
            ? file.content 
            : JSON.stringify(file.content);
        } 
        else if (file.text) {
          content = typeof file.text === 'string' 
            ? file.text 
            : JSON.stringify(file.text);
        }
        else if (file.data) {
          content = typeof file.data === 'string' 
            ? file.data
            : JSON.stringify(file.data);
        }
        // For base64 content, decode it
        else if (file.base64Content) {
          try {
            // Use browser or Node.js compatible base64 decoding
            content = typeof window !== 'undefined'
              ? atob(file.base64Content)
              : Buffer.from(file.base64Content, 'base64').toString('utf-8');
          } catch (e) {
            console.warn(`Failed to decode base64 content for ${fileName}:`, e);
            content = '(Unable to decode content)';
          }
        }
        // Fallback to any available text fields
        else if (file.description) {
          content = file.description;
        }
      }
      
      // For empty content, use fallback metadata extraction
      if (!content) {
        // Extract any available metadata
        const metadata: Record<string, any> = {};
        if (typeof file === 'object') {
          Object.entries(file).forEach(([key, value]) => {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              if (key !== 'name' && key !== 'type') {
                metadata[key] = value;
              }
            }
          });
        }
        
        extractedContent.push({
          fileName,
          mimeType,
          content: `File metadata: ${JSON.stringify(metadata)}`,
          metadata
        });
      } else {
        extractedContent.push({
          fileName,
          mimeType,
          content
        });
      }
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
  if (!text) return [];
  
  // Remove common stop words for better keyword extraction
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 
    'were', 'be', 'been', 'being', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'from', 'up',
    'down', 'of', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should',
    'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn',
    'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn',
    'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn'
  ]);
  
  // Clean and tokenize text
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
    .split(/\s+/)              // Split on whitespace
    .filter(word => word.length > 2 && !stopWords.has(word));  // Filter out stop words and short words
  
  // Count word frequency
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }
  
  // Sort by frequency and return top keywords
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(entry => entry[0]);
}

/**
 * Generate mock embeddings (placeholder for BERT-based embeddings)
 * In a production system, this would use a proper NLP model
 */
export function generateMockEmbeddings(text: string, dimensions: number = 10): number[] {
  // This is a simplified hash function to generate consistent values
  const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  };
  
  // Generate deterministic embeddings based on text
  const embeddings: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    // Use different seed for each dimension
    const seed = simpleHash(text + i.toString());
    // Generate value between -1 and 1
    embeddings.push(Math.sin(seed) / 2 + 0.5);
  }
  
  return embeddings;
}

/**
 * Process knowledge base files to extract content and generate embeddings
 */
export async function processKnowledgeBase(knowledgeBase: KnowledgeBase): Promise<{
  extractedContent: FileContent[];
  embeddings: ContentEmbedding[];
}> {
  if (!knowledgeBase || !knowledgeBase.files || !Array.isArray(knowledgeBase.files)) {
    return { extractedContent: [], embeddings: [] };
  }
  
  console.log(`Processing knowledge base: ${knowledgeBase.title} with ${knowledgeBase.files.length} files`);
  
  // Extract content from files
  const extractedContent = await extractContentFromFiles(knowledgeBase.files);
  
  // Generate embeddings for each file
  const embeddings: ContentEmbedding[] = extractedContent.map(file => {
    const keywords = extractKeywords(file.content);
    const embedding = generateMockEmbeddings(file.content);
    
    return {
      fileName: file.fileName,
      embedding,
      keywords
    };
  });
  
  return { extractedContent, embeddings };
}