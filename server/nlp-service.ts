import { LanguageServiceClient } from '@google-cloud/language';

// Initialize Google Cloud Natural Language client
let language: LanguageServiceClient | null = null;

// Only initialize if credentials are properly configured
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID) {
    // Check if credentials is a file path or JSON string
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
      // It's a JSON string
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      language = new LanguageServiceClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials,
      });
    } else {
      // It's a file path
      language = new LanguageServiceClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });
    }
    console.log('Google Cloud NLP initialized successfully');
  } else {
    console.log('Google Cloud NLP credentials not configured, using fallback analysis');
  }
} catch (error) {
  console.warn('Failed to initialize Google Cloud NLP:', error instanceof Error ? error.message : String(error));
  language = null;
}

export interface NLPAnalysis {
  intent: 'register_child' | 'find_programs' | 'schedule_inquiry' | 'cost_inquiry' | 'general_question';
  sentiment: 'positive' | 'neutral' | 'negative';
  entities: Array<{
    name: string;
    type: string;
    salience: number;
  }>;
  keywords: string[];
  confidence: number;
}

export class NLPService {
  
  async analyzeUserInput(text: string): Promise<NLPAnalysis> {
    // If Google Cloud NLP is not available, use fallback analysis
    if (!language) {
      console.log('Using fallback NLP analysis');
      return this.fallbackAnalysis(text);
    }

    try {
      const document = {
        content: text,
        type: 'PLAIN_TEXT' as const,
      };

      // Analyze sentiment
      const [sentimentResult] = await language.analyzeSentiment({ document });
      
      // Extract entities
      const [entitiesResult] = await language.analyzeEntities({ document });
      
      // Analyze syntax for better understanding
      const [syntaxResult] = await language.analyzeSyntax({ document });

      // Determine intent based on keywords and entities
      const intent = this.determineIntent(text, entitiesResult.entities || []);
      
      // Extract meaningful keywords
      const keywords = this.extractKeywords(syntaxResult.tokens || []);

      return {
        intent,
        sentiment: this.getSentimentLabel(sentimentResult.documentSentiment?.score || 0),
        entities: (entitiesResult.entities || []).map(entity => ({
          name: entity.name || '',
          type: entity.type || '',
          salience: entity.salience || 0
        })),
        keywords,
        confidence: Math.abs(sentimentResult.documentSentiment?.score || 0)
      };

    } catch (error) {
      console.error('NLP Analysis Error:', error);
      // Fallback to basic pattern matching
      return this.fallbackAnalysis(text);
    }
  }

  private determineIntent(text: string, entities: any[]): NLPAnalysis['intent'] {
    const lowerText = text.toLowerCase();
    
    // Check for registration intent
    if (lowerText.includes('register') || lowerText.includes('sign up') || 
        lowerText.includes('enroll') || lowerText.includes('child') ||
        lowerText.includes('daughter') || lowerText.includes('son')) {
      return 'register_child';
    }
    
    // Check for program/class inquiry
    if (lowerText.includes('program') || lowerText.includes('class') || 
        lowerText.includes('activity') || lowerText.includes('course') ||
        lowerText.includes('lesson')) {
      return 'find_programs';
    }
    
    // Check for schedule inquiry
    if (lowerText.includes('schedule') || lowerText.includes('time') || 
        lowerText.includes('when') || lowerText.includes('calendar') ||
        lowerText.includes('timing')) {
      return 'schedule_inquiry';
    }
    
    // Check for cost inquiry
    if (lowerText.includes('cost') || lowerText.includes('price') || 
        lowerText.includes('fee') || lowerText.includes('budget') ||
        lowerText.includes('money') || lowerText.includes('payment')) {
      return 'cost_inquiry';
    }
    
    return 'general_question';
  }

  private getSentimentLabel(score: number): 'positive' | 'neutral' | 'negative' {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  private extractKeywords(tokens: any[]): string[] {
    return tokens
      .filter(token => 
        token.partOfSpeech?.tag === 'NOUN' || 
        token.partOfSpeech?.tag === 'VERB' ||
        token.partOfSpeech?.tag === 'ADJ'
      )
      .map(token => token.text?.content || '')
      .filter(word => word.length > 2)
      .slice(0, 5); // Limit to top 5 keywords
  }

  private fallbackAnalysis(text: string): NLPAnalysis {
    const lowerText = text.toLowerCase();
    
    return {
      intent: this.determineIntent(text, []),
      sentiment: 'neutral',
      entities: [],
      keywords: lowerText.split(' ').filter(word => word.length > 3).slice(0, 3),
      confidence: 0.5
    };
  }

  // Extract specific information from user input
  extractChildInfo(text: string, entities: any[]) {
    const info: any = {};
    
    // Extract names from entities
    const personEntities = entities.filter(e => e.type === 'PERSON');
    if (personEntities.length > 0) {
      const fullName = personEntities[0].name.split(' ');
      info.firstName = fullName[0];
      if (fullName.length > 1) {
        info.lastName = fullName.slice(1).join(' ');
      }
    }
    
    // Extract age from text
    const ageMatch = text.match(/\b(\d{1,2})\s*(?:years?\s*old|year|yr)\b/i) || 
                    text.match(/\b(?:age|aged)\s*(\d{1,2})\b/i);
    if (ageMatch) {
      info.age = parseInt(ageMatch[1]);
    }
    
    // Extract grade level
    const gradeMatch = text.match(/\b(?:grade|class)\s*(\d{1,2}|k|kindergarten)\b/i);
    if (gradeMatch) {
      info.gradeLevel = gradeMatch[1].toLowerCase() === 'k' ? 'Kindergarten' : `Grade ${gradeMatch[1]}`;
    }
    
    // Extract phone number
    const phoneMatch = text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    if (phoneMatch) {
      info.parentPhone = phoneMatch[0];
    }
    
    // Extract address
    const addressMatch = text.match(/\d+[\w\s,.-]+(?:\w{2}\s*\d{5})/i);
    if (addressMatch) {
      info.homeAddress = addressMatch[0];
    }
    
    return info;
  }
}

export const nlpService = new NLPService();