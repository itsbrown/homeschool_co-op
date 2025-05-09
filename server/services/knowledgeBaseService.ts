import { db } from "../db";
import { knowledgeBases, knowledgeReferences } from "@shared/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { KnowledgeBase } from "@shared/schema";
import Anthropic from '@anthropic-ai/sdk';

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

// Initialize Anthropic client with API key from environment variables
let anthropic: Anthropic | null = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  } else {
    console.warn('Anthropic API Key not provided in environment variables');
  }
} catch (error) {
  console.error('Failed to initialize Anthropic client:', error);
}

/**
 * Finds relevant knowledge bases for a specific context
 */
export async function findRelevantKnowledgeBases(
  subject: string | undefined,
  gradeLevel: string | undefined,
  userId: number | undefined,
  limit: number = 3
): Promise<KnowledgeBase[]> {
  try {
    // Build query to find relevant knowledge bases
    let queryConditions = and(
      eq(knowledgeBases.isPublished, true),
    );
    
    // If subject provided, filter by it
    if (subject) {
      queryConditions = and(
        queryConditions,
        or(
          eq(knowledgeBases.subject, subject),
          isNotNull(knowledgeBases.subject)
        )
      );
    }
    
    // If grade level provided, filter by it
    if (gradeLevel) {
      queryConditions = and(
        queryConditions,
        or(
          eq(knowledgeBases.gradeLevel, gradeLevel),
          isNotNull(knowledgeBases.gradeLevel)
        )
      );
    }

    // Get knowledge bases based on filters
    const results = await db.query.knowledgeBases.findMany({
      where: queryConditions,
      orderBy: [knowledgeBases.avgRating, knowledgeBases.downloads],
      limit
    });

    return results;
  } catch (error) {
    console.error("Error finding relevant knowledge bases:", error);
    return [];
  }
}

/**
 * Interface for structured contextual information
 */
export interface ContextualInfo {
  subject?: string;
  gradeLevel?: string;
  learningStyles?: string[];
  duration?: number;
  keywords?: string[];
  standards?: string[];
  differentiationNeeds?: string[];
  userId?: number;
}

/**
 * Generate enhanced prompt content with knowledge base integration
 */
export async function generateEnhancedPrompt(
  basePrompt: string,
  subject: string | undefined,
  gradeLevel: string | undefined,
  userId: number | undefined,
  type: "curriculum" | "lesson" | "assessment"
): Promise<string> {
  try {
    // Find relevant knowledge bases
    const relevantKnowledgeBases = await findRelevantKnowledgeBases(subject, gradeLevel, userId);
    
    if (relevantKnowledgeBases.length === 0) {
      return basePrompt;
    }

    // Extract content from knowledge bases
    let enrichedPrompt = basePrompt + "\n\n### Reference Knowledge ###\n";
    
    // Create a conversational prompt format
    for (const kb of relevantKnowledgeBases) {
      enrichedPrompt += `\nFrom ${kb.title} (${kb.type}):\n`;
      
      // Different formatting based on knowledge base type
      if (typeof kb.content === 'object' && kb.content !== null) {
        // Handle structured content based on type
        switch (kb.type) {
          case "curriculum_standards":
            if ('standards' in kb.content) {
              const standards = kb.content.standards;
              if (Array.isArray(standards)) {
                enrichedPrompt += "Standards:\n" + standards.map((s: any) => `- ${s}`).join("\n");
              }
            }
            break;
            
          case "teaching_resources":
            if ('resources' in kb.content) {
              const resources = kb.content.resources;
              if (Array.isArray(resources)) {
                enrichedPrompt += "Resources:\n" + resources.map((r: any) => `- ${r.title}: ${r.description}`).join("\n");
              }
            }
            break;
            
          case "assessment_tools":
            if ('assessmentMethods' in kb.content) {
              const methods = kb.content.assessmentMethods;
              if (Array.isArray(methods)) {
                enrichedPrompt += "Assessment Methods:\n" + methods.map((m: any) => `- ${m.name}: ${m.description}`).join("\n");
              }
            }
            break;
            
          default:
            // For other types or unknown structure, use the top-level summary if available
            if ('summary' in kb.content) {
              enrichedPrompt += kb.content.summary;
            } else {
              enrichedPrompt += JSON.stringify(kb.content).substring(0, 500) + "...";
            }
        }
      } else if (typeof kb.content === 'string') {
        // Handle string content
        enrichedPrompt += kb.content.substring(0, 500) + "...";
      }
    }
    
    // Record the usage of these knowledge bases for analytics
    const referencePromises = relevantKnowledgeBases.map(kb => 
      db.insert(knowledgeReferences).values({
        knowledgeBaseId: kb.id,
        referenceType: type,
        referenceId: 0 // Will be updated later when the actual content is created
      })
    );
    
    await Promise.all(referencePromises);
    
    return enrichedPrompt;
  } catch (error) {
    console.error("Error generating enhanced prompt:", error);
    return basePrompt; // Fall back to the original prompt if there's an error
  }
}

/**
 * Generate enhanced contextual prompt with structured knowledge base integration
 * Improved version that returns structured context for multi-step generation
 */
export async function generateEnhancedContextualPrompt(
  basePrompt: string,
  contextInfo: ContextualInfo,
  type: "curriculum" | "lesson" | "assessment"
): Promise<{ prompt: string, context: any }> {
  try {
    // Extract context information
    const { subject, gradeLevel, userId, learningStyles, duration, standards, differentiationNeeds } = contextInfo;
    
    // Find relevant knowledge bases
    const relevantKnowledgeBases = await findRelevantKnowledgeBases(subject, gradeLevel, userId);
    
    // Initialize context object with available contextual information
    const context: any = {
      subject,
      gradeLevel,
      learningStyles,
      duration,
      standards,
      differentiationNeeds,
      knowledgeBases: []
    };
    
    // Start with base prompt
    let enrichedPrompt = basePrompt;
    
    // If no knowledge bases found, return just the base prompt with context
    if (relevantKnowledgeBases.length === 0) {
      return { prompt: enrichedPrompt, context };
    }

    // Add reference knowledge section
    enrichedPrompt += "\n\n### Reference Knowledge ###\n";
    
    // Process each knowledge base
    for (const kb of relevantKnowledgeBases) {
      // Add to context object for structured use
      context.knowledgeBases.push({
        id: kb.id,
        title: kb.title,
        type: kb.type,
        subject: kb.subject,
        gradeLevel: kb.gradeLevel
      });
      
      // Add to prompt in conversational format
      enrichedPrompt += `\nFrom ${kb.title} (${kb.type}):\n`;
      
      // Different formatting based on knowledge base type
      if (typeof kb.content === 'object' && kb.content !== null) {
        // Handle structured content based on type
        switch (kb.type) {
          case "curriculum_standards":
            if ('standards' in kb.content) {
              const standards = kb.content.standards;
              if (Array.isArray(standards)) {
                enrichedPrompt += "Standards:\n" + standards.map((s: any) => `- ${s}`).join("\n");
                // Add to context object for structured use
                if (!context.curriculumStandards) context.curriculumStandards = [];
                context.curriculumStandards = [...context.curriculumStandards, ...standards];
              }
            }
            break;
            
          case "teaching_resources":
            if ('resources' in kb.content) {
              const resources = kb.content.resources;
              if (Array.isArray(resources)) {
                enrichedPrompt += "Resources:\n" + resources.map((r: any) => `- ${r.title}: ${r.description}`).join("\n");
                // Add to context object for structured use
                if (!context.teachingResources) context.teachingResources = [];
                context.teachingResources = [...context.teachingResources, ...resources];
              }
            }
            break;
            
          case "assessment_tools":
            if ('assessmentMethods' in kb.content) {
              const methods = kb.content.assessmentMethods;
              if (Array.isArray(methods)) {
                enrichedPrompt += "Assessment Methods:\n" + methods.map((m: any) => `- ${m.name}: ${m.description}`).join("\n");
                // Add to context object for structured use
                if (!context.assessmentMethods) context.assessmentMethods = [];
                context.assessmentMethods = [...context.assessmentMethods, ...methods];
              }
            }
            break;
            
          case "subject_specific":
            if ('concepts' in kb.content) {
              const concepts = kb.content.concepts;
              if (Array.isArray(concepts)) {
                enrichedPrompt += "Key Concepts:\n" + concepts.map((c: any) => `- ${c}`).join("\n");
                // Add to context object for structured use
                if (!context.keyConcepts) context.keyConcepts = [];
                context.keyConcepts = [...context.keyConcepts, ...concepts];
              }
            }
            if ('misconceptions' in kb.content) {
              const misconceptions = kb.content.misconceptions;
              if (Array.isArray(misconceptions)) {
                enrichedPrompt += "Common Misconceptions:\n" + misconceptions.map((m: any) => `- ${m}`).join("\n");
                // Add to context object
                if (!context.commonMisconceptions) context.commonMisconceptions = [];
                context.commonMisconceptions = [...context.commonMisconceptions, ...misconceptions];
              }
            }
            break;
            
          case "pedagogical_approaches":
            if ('approaches' in kb.content) {
              const approaches = kb.content.approaches;
              if (Array.isArray(approaches)) {
                enrichedPrompt += "Pedagogical Approaches:\n" + approaches.map((a: any) => `- ${a.name}: ${a.description}`).join("\n");
                // Add to context object
                if (!context.pedagogicalApproaches) context.pedagogicalApproaches = [];
                context.pedagogicalApproaches = [...context.pedagogicalApproaches, ...approaches];
              }
            }
            break;
            
          default:
            // For other types or unknown structure, use the top-level summary if available
            if ('summary' in kb.content) {
              enrichedPrompt += kb.content.summary;
              // Add to context
              if (!context.additionalContent) context.additionalContent = [];
              context.additionalContent.push({
                title: kb.title,
                content: kb.content.summary
              });
            } else {
              const contentStr = JSON.stringify(kb.content).substring(0, 500) + "...";
              enrichedPrompt += contentStr;
              // Add to context
              if (!context.additionalContent) context.additionalContent = [];
              context.additionalContent.push({
                title: kb.title,
                content: contentStr
              });
            }
        }
      } else if (typeof kb.content === 'string') {
        // Handle string content
        const contentStr = kb.content.substring(0, 500) + "...";
        enrichedPrompt += contentStr;
        // Add to context
        if (!context.additionalContent) context.additionalContent = [];
        context.additionalContent.push({
          title: kb.title,
          content: contentStr
        });
      }
    }
    
    // Record the usage of these knowledge bases for analytics
    const referencePromises = relevantKnowledgeBases.map(kb => 
      db.insert(knowledgeReferences).values({
        knowledgeBaseId: kb.id,
        referenceType: type,
        referenceId: 0 // Will be updated later when the actual content is created
      })
    );
    
    await Promise.all(referencePromises);
    
    return { prompt: enrichedPrompt, context };
  } catch (error) {
    console.error("Error generating enhanced contextual prompt:", error);
    // Fall back to the original prompt if there's an error
    return { 
      prompt: basePrompt, 
      context: {
        subject: contextInfo.subject,
        gradeLevel: contextInfo.gradeLevel,
        errorOccurred: true
      } 
    };
  }
}

/**
 * Extract structured knowledge from text using AI
 */
export async function extractKnowledgeFromText(
  text: string,
  type: string, 
  subject?: string, 
  gradeLevel?: string
): Promise<object> {
  try {
    if (!anthropic) {
      console.warn('Anthropic client not initialized. Unable to extract knowledge.');
      throw new Error('Anthropic API not available');
    }
    
    // Define the structure based on the knowledge base type
    let structurePrompt = '';
    
    switch (type) {
      case 'curriculum_standards':
        structurePrompt = `
          Please extract curriculum standards from the provided text and format as a JSON object:
          {
            "standards": ["standard 1", "standard 2", ...],
            "summary": "A brief overview of these standards",
            "keyCompetencies": ["competency 1", "competency 2", ...],
            "crossCuttingConcepts": ["concept 1", "concept 2", ...]
          }
        `;
        break;
        
      case 'teaching_resources':
        structurePrompt = `
          Please extract teaching resources from the provided text and format as a JSON object:
          {
            "resources": [
              {"title": "Resource 1", "description": "Description", "type": "video/article/exercise", "url": "optional url"},
              ...
            ],
            "summary": "A brief overview of these resources",
            "targetAudience": "Intended audience for these resources"
          }
        `;
        break;
        
      case 'assessment_tools':
        structurePrompt = `
          Please extract assessment methods from the provided text and format as a JSON object:
          {
            "assessmentMethods": [
              {"name": "Method 1", "description": "Description", "bestFor": "formative/summative/diagnostic"},
              ...
            ],
            "summary": "A brief overview of these assessment methods",
            "rubrics": [{"name": "Rubric 1", "criteria": ["criterion 1", "criterion 2", ...]}]
          }
        `;
        break;
        
      case 'subject_specific':
        structurePrompt = `
          Please extract key subject knowledge from the provided text and format as a JSON object:
          {
            "concepts": ["concept 1", "concept 2", ...],
            "skills": ["skill 1", "skill 2", ...],
            "summary": "A brief overview of this subject knowledge",
            "misconceptions": ["common misconception 1", "misconception 2", ...],
            "prerequisites": ["prerequisite 1", "prerequisite 2", ...]
          }
        `;
        break;
        
      case 'pedagogical_approaches':
        structurePrompt = `
          Please extract pedagogical approaches from the provided text and format as a JSON object:
          {
            "approaches": [
              {"name": "Approach 1", "description": "Description", "bestFor": "learning style or context"},
              ...
            ],
            "summary": "A brief overview of these approaches",
            "implementationTips": ["tip 1", "tip 2", ...]
          }
        `;
        break;
        
      default:
        // General knowledge base structure
        structurePrompt = `
          Please extract key knowledge from the provided text and format as a JSON object:
          {
            "keyPoints": ["point 1", "point 2", ...],
            "summary": "A brief overview of this knowledge",
            "applications": ["application 1", "application 2", ...]
          }
        `;
    }
    
    // Additional context based on subject and grade level
    let contextPrompt = '';
    if (subject) {
      contextPrompt += `\nThis content relates to the subject: ${subject}.`;
    }
    if (gradeLevel) {
      contextPrompt += `\nThis content is targeted at the grade level: ${gradeLevel}.`;
    }
    
    // Call Claude API
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: `You are an expert knowledge extraction system. ${structurePrompt}${contextPrompt}`,
      messages: [
        { role: 'user', content: `Please extract structured knowledge from the following text:\n\n${text}` }
      ],
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }
    
    // Extract the JSON from the response
    const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }
    
    const knowledge = JSON.parse(jsonMatch[0]);
    return knowledge;
  } catch (error: any) {
    console.error("Error extracting knowledge:", error);
    
    // Create a minimal default structure if extraction fails
    return {
      summary: "Failed to extract structured knowledge.",
      content: text.substring(0, 1000) // Include some of the original text
    };
  }
}

/**
 * Update a knowledge reference with the actual content ID
 */
export async function updateKnowledgeReference(
  knowledgeBaseId: number,
  referenceType: "curriculum" | "lesson" | "assessment",
  referenceId: number
): Promise<void> {
  try {
    // Find the most recent reference for this knowledge base and reference type
    const recentReference = await db.query.knowledgeReferences.findFirst({
      where: and(
        eq(knowledgeReferences.knowledgeBaseId, knowledgeBaseId),
        eq(knowledgeReferences.referenceType, referenceType)
      ),
      orderBy: knowledgeReferences.createdAt
    });
    
    if (recentReference) {
      // Update the reference ID
      await db.update(knowledgeReferences)
        .set({ referenceId })
        .where(eq(knowledgeReferences.id, recentReference.id));
    }
  } catch (error) {
    console.error("Error updating knowledge reference:", error);
  }
}