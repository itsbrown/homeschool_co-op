import Anthropic from '@anthropic-ai/sdk';
import { ExtractedContent } from './fileProcessor';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ContentAnalysis {
  summary: string;
  keyTopics: string[];
  concepts: string[];
  gradeLevel: string;
  subjectAreas: string[];
  learningObjectives: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  readabilityScore: number;
}

export interface ContentEmbedding {
  content: string;
  embedding: number[];
  topics: string[];
  concepts: string[];
}

/**
 * Analyze content using Anthropic AI to extract educational insights
 */
export async function analyzeContent(content: string, fileName: string): Promise<ContentAnalysis> {
  try {
    const prompt = `Analyze this educational content and provide structured insights:

Content: "${content.substring(0, 5000)}..."
File: ${fileName}

Please provide a JSON response with the following structure:
{
  "summary": "Brief 2-3 sentence summary of the content",
  "keyTopics": ["array", "of", "main", "topics"],
  "concepts": ["key", "educational", "concepts"],
  "gradeLevel": "K-2, 3-5, 6-8, 9-12, or College",
  "subjectAreas": ["subject", "areas", "covered"],
  "learningObjectives": ["what", "students", "will", "learn"],
  "difficulty": "Beginner, Intermediate, or Advanced",
  "readabilityScore": 0-100
}

Focus on educational value and learning outcomes.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysisText = (response.content[0] as any).text || '';
    
    try {
      const analysis = JSON.parse(analysisText);
      
      return {
        summary: analysis.summary || 'Educational content requiring further analysis',
        keyTopics: Array.isArray(analysis.keyTopics) ? analysis.keyTopics : [],
        concepts: Array.isArray(analysis.concepts) ? analysis.concepts : [],
        gradeLevel: analysis.gradeLevel || 'General',
        subjectAreas: Array.isArray(analysis.subjectAreas) ? analysis.subjectAreas : ['General'],
        learningObjectives: Array.isArray(analysis.learningObjectives) ? analysis.learningObjectives : [],
        difficulty: ['Beginner', 'Intermediate', 'Advanced'].includes(analysis.difficulty) 
          ? analysis.difficulty : 'Intermediate',
        readabilityScore: typeof analysis.readabilityScore === 'number' 
          ? Math.max(0, Math.min(100, analysis.readabilityScore)) : 50
      };
    } catch (parseError) {
      console.warn('Failed to parse AI analysis response, using fallback analysis');
      return generateFallbackAnalysis(content);
    }

  } catch (error) {
    console.error('AI content analysis failed:', error);
    return generateFallbackAnalysis(content);
  }
}

/**
 * Generate content embeddings for semantic search
 */
export async function generateContentEmbedding(content: string): Promise<ContentEmbedding> {
  try {
    const prompt = `Analyze this content for semantic understanding and extract key information:

Content: "${content.substring(0, 3000)}..."

Provide a JSON response with:
{
  "topics": ["main", "topics", "in", "content"],
  "concepts": ["key", "concepts", "and", "ideas"],
  "semanticKeywords": ["words", "for", "search", "indexing"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysisText = (response.content[0] as any).text || '';
    
    try {
      const analysis = JSON.parse(analysisText);
      
      const embedding = generateSimpleEmbedding(content, analysis.semanticKeywords || []);
      
      return {
        content: content.substring(0, 1000),
        embedding,
        topics: Array.isArray(analysis.topics) ? analysis.topics : [],
        concepts: Array.isArray(analysis.concepts) ? analysis.concepts : []
      };
    } catch (parseError) {
      return generateFallbackEmbedding(content);
    }

  } catch (error) {
    console.error('Embedding generation failed:', error);
    return generateFallbackEmbedding(content);
  }
}

/**
 * Process multiple extracted files with AI analysis
 */
export async function processExtractedContent(
  extractedFiles: ExtractedContent[]
): Promise<{
  analyses: (ContentAnalysis & { fileName: string })[];
  embeddings: (ContentEmbedding & { fileName: string })[];
  overallAnalysis: {
    combinedTopics: string[];
    suggestedGradeLevel: string;
    primarySubjects: string[];
    totalWords: number;
    avgReadability: number;
  };
}> {
  const analyses: (ContentAnalysis & { fileName: string })[] = [];
  const embeddings: (ContentEmbedding & { fileName: string })[] = [];

  for (const file of extractedFiles) {
    if (file.content && file.content.length > 0) {
      const [analysis, embedding] = await Promise.all([
        analyzeContent(file.content, file.fileName),
        generateContentEmbedding(file.content)
      ]);

      analyses.push({ ...analysis, fileName: file.fileName });
      embeddings.push({ ...embedding, fileName: file.fileName });
    }
  }

  const allTopics = new Set<string>();
  const allSubjects = new Set<string>();
  let totalWords = 0;
  let totalReadability = 0;
  let validReadabilityCount = 0;

  analyses.forEach(analysis => {
    analysis.keyTopics.forEach(topic => allTopics.add(topic));
    analysis.subjectAreas.forEach(subject => allSubjects.add(subject));
    
    if (analysis.readabilityScore > 0) {
      totalReadability += analysis.readabilityScore;
      validReadabilityCount++;
    }
  });

  extractedFiles.forEach(file => {
    totalWords += file.metadata.words;
  });

  const gradeLevels = analyses.map(a => a.gradeLevel);
  const suggestedGradeLevel = getMostCommon(gradeLevels) || 'General';

  const overallAnalysis = {
    combinedTopics: Array.from(allTopics).slice(0, 10),
    suggestedGradeLevel,
    primarySubjects: Array.from(allSubjects).slice(0, 5),
    totalWords,
    avgReadability: validReadabilityCount > 0 ? Math.round(totalReadability / validReadabilityCount) : 50
  };

  return { analyses, embeddings, overallAnalysis };
}

function generateFallbackAnalysis(content: string): ContentAnalysis {
  const words = content.split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).length;
  const avgWordsPerSentence = words / sentences;

  let readabilityScore = 70;
  if (avgWordsPerSentence < 10) readabilityScore = 85;
  else if (avgWordsPerSentence > 20) readabilityScore = 45;

  const keyTerms = content
    .toLowerCase()
    .match(/\b[a-z]{4,}\b/g) || [];
  
  const uniqueTerms = [...new Set(keyTerms)]
    .filter(term => !isCommonWord(term))
    .slice(0, 5);

  return {
    summary: `Educational content with approximately ${words} words covering various topics.`,
    keyTopics: uniqueTerms,
    concepts: uniqueTerms.slice(0, 3),
    gradeLevel: words < 500 ? 'K-5' : words < 1500 ? '6-8' : '9-12',
    subjectAreas: ['General Education'],
    learningObjectives: ['Understanding key concepts', 'Building knowledge'],
    difficulty: avgWordsPerSentence > 15 ? 'Advanced' : 'Intermediate',
    readabilityScore
  };
}

function generateSimpleEmbedding(content: string, keywords: string[] = []): number[] {
  const embedding = new Array(384).fill(0);
  
  const contentLower = content.toLowerCase();
  const contentHash = simpleHash(contentLower);
  
  for (let i = 0; i < 384; i++) {
    const seed = contentHash + i;
    embedding[i] = (Math.sin(seed) + 1) / 2;
  }
  
  keywords.forEach((keyword, index) => {
    const keywordHash = simpleHash(keyword);
    const position = keywordHash % 384;
    embedding[position] = Math.min(1, embedding[position] + 0.1);
  });
  
  return embedding;
}

function generateFallbackEmbedding(content: string): ContentEmbedding {
  const words = content.split(/\s+/).slice(0, 100);
  const topics = words.filter(word => word.length > 4).slice(0, 5);
  
  return {
    content: content.substring(0, 1000),
    embedding: generateSimpleEmbedding(content),
    topics,
    concepts: topics.slice(0, 3)
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getMostCommon<T>(array: T[]): T | undefined {
  const counts = new Map<T, number>();
  array.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
  
  let maxCount = 0;
  let mostCommon: T | undefined;
  
  counts.forEach((count, item) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  });
  
  return mostCommon;
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man',
    'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let',
    'put', 'say', 'she', 'too', 'use', 'that', 'with', 'have', 'this', 'will',
    'your', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time',
    'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over',
    'such', 'take', 'than', 'them', 'well', 'were'
  ]);
  
  return commonWords.has(word);
}