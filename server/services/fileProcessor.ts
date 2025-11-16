import fs from 'fs';
import path from 'path';
// Temporarily disable PDF parsing to fix server startup
// import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ExtractedContent {
  fileName: string;
  fileType: string;
  content: string;
  metadata: {
    pages?: number;
    words: number;
    characters: number;
    size: number;
  };
}

export interface ProcessingResult {
  success: boolean;
  extractedContent?: ExtractedContent;
  error?: string;
}

/**
 * Extract text content from uploaded files
 */
export async function extractFileContent(filePath: string, fileName: string): Promise<ProcessingResult> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    
    // Dynamic import for ESM-only module (better Jest compatibility)
    const { fileTypeFromBuffer } = await import('file-type');
    const fileType = await fileTypeFromBuffer(buffer);
    
    let content = '';
    let metadata: ExtractedContent['metadata'] = {
      words: 0,
      characters: 0,
      size: buffer.length
    };

    switch (fileType?.mime) {
      case 'application/pdf':
        // Temporarily disabled PDF parsing
        content = 'PDF content extraction temporarily disabled';
        metadata.pages = 1;
        break;

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await mammoth.extractRawText({ buffer });
        content = docxResult.value;
        break;

      case 'text/plain':
        content = buffer.toString('utf-8');
        break;

      case 'text/html':
        // Basic HTML text extraction (remove tags)
        content = buffer.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        break;

      default:
        // Try to read as text for unknown file types
        try {
          content = buffer.toString('utf-8');
          // Check if it's readable text
          if (content.includes('\0') || content.length === 0) {
            throw new Error('Binary file or empty content');
          }
        } catch {
          return {
            success: false,
            error: `Unsupported file type: ${fileType?.mime || 'unknown'}`
          };
        }
    }

    // Calculate word and character counts
    metadata.words = content.split(/\s+/).filter(word => word.length > 0).length;
    metadata.characters = content.length;

    return {
      success: true,
      extractedContent: {
        fileName,
        fileType: fileType?.mime || 'text/plain',
        content: content.trim(),
        metadata
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to extract content from ${fileName}: ${errorMessage}`
    };
  }
}

/**
 * Process multiple files and extract content from all
 */
export async function processFiles(files: { path: string; name: string }[]): Promise<{
  successful: ExtractedContent[];
  failed: { fileName: string; error: string }[];
}> {
  const successful: ExtractedContent[] = [];
  const failed: { fileName: string; error: string }[] = [];

  for (const file of files) {
    const result = await extractFileContent(file.path, file.name);
    
    if (result.success && result.extractedContent) {
      successful.push(result.extractedContent);
    } else {
      failed.push({
        fileName: file.name,
        error: result.error || 'Unknown processing error'
      });
    }
  }

  return { successful, failed };
}

/**
 * Extract key terms and concepts from text content
 */
export function extractKeyTerms(content: string, maxTerms: number = 20): string[] {
  // Remove common words and extract meaningful terms
  const commonWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
    'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
    'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
    'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
    'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
    'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year',
    'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
    'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
    'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
  ]);

  // Extract words, remove punctuation, convert to lowercase
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => 
      word.length >= 3 && 
      word.length <= 20 && 
      !commonWords.has(word) &&
      isNaN(Number(word))
    );

  // Count word frequencies
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });

  // Sort by frequency and return top terms
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([word]) => word);
}

/**
 * Generate content summary using text analysis
 */
export function generateContentSummary(content: string, maxLength: number = 500): string {
  if (content.length <= maxLength) {
    return content;
  }

  // Split into sentences
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (sentences.length === 0) {
    return content.substring(0, maxLength) + '...';
  }

  // Take first few sentences that fit within the limit
  let summary = '';
  for (const sentence of sentences) {
    const potential = summary + sentence.trim() + '. ';
    if (potential.length > maxLength) {
      break;
    }
    summary = potential;
  }

  return summary || content.substring(0, maxLength) + '...';
}