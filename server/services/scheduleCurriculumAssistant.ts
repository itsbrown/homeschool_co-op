import { anthropicService } from "./anthropicService";
import { knowledgeBaseProcessor } from "./knowledgeBaseProcessor";
import { storage } from "../storage";
import type { WeeklySkeleton, SkeletonBlock, WeekPlan, WeekPlanBlock } from "@shared/schema";

function parseJsonResponse(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("No JSON object found in response");
  }
  let braceCount = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < cleaned.length; i++) {
    if (cleaned[i] === "{") braceCount++;
    else if (cleaned[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  if (jsonEnd === -1) {
    throw new Error("Incomplete JSON object in response");
  }
  return JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
}

async function getSchoolKnowledgeBaseContext(schoolId: number): Promise<string> {
  try {
    const school = await storage.getSchool(schoolId);
    if (!school) return "";
    const knowledgeBases = await storage.getKnowledgeBasesByAuthor(school.adminId);
    if (knowledgeBases.length === 0) return "";
    return await knowledgeBaseProcessor.extractContextFromKnowledgeBases(knowledgeBases);
  } catch (error) {
    console.error("Failed to fetch knowledge base context:", error);
    return "";
  }
}

class ScheduleCurriculumAssistant {
  private static instance: ScheduleCurriculumAssistant;

  private constructor() {}

  public static getInstance(): ScheduleCurriculumAssistant {
    if (!ScheduleCurriculumAssistant.instance) {
      ScheduleCurriculumAssistant.instance = new ScheduleCurriculumAssistant();
    }
    return ScheduleCurriculumAssistant.instance;
  }

  public isAvailable(): boolean {
    return anthropicService.getStatus().available;
  }

  public async generateWeekPlan(params: {
    skeleton: WeeklySkeleton;
    blocks: SkeletonBlock[];
    weekNumber: number;
    gradeLevel: string;
    schoolId: number;
    previousWeekSummary?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: "AI service is not available" };
    }

    try {
      const kbContext = await getSchoolKnowledgeBaseContext(params.schoolId);

      const blockDescriptions = params.blocks
        .map(
          (b) =>
            `- ${b.defaultTitle} (${b.blockType}, ${b.startTime}-${b.endTime}, Day ${b.dayOfWeek}${b.subjectArea ? `, Subject: ${b.subjectArea}` : ""})`
        )
        .join("\n");

      const systemPrompt = `You are a curriculum planning expert for ${params.gradeLevel} students at an educational academy.

CONTEXT:
- Grade Level: ${params.gradeLevel}
- Week Number: ${params.weekNumber}
- Skeleton: "${params.skeleton.name}" - ${params.skeleton.description || "No description"}
- Operating Days: ${(params.skeleton.operatingDays || []).join(", ")}
- Schedule Blocks:
${blockDescriptions}
${params.previousWeekSummary ? `\n- Previous Week Summary: ${params.previousWeekSummary}` : ""}
${kbContext ? `\nKNOWLEDGE BASE CONTENT:\n${kbContext}` : ""}

RULES:
- Align with age-appropriate educational standards
- Build progressive difficulty week over week
- Include diverse learning activities
- Keep suggestions practical and actionable
- Generate content for each skeleton block provided

Respond with valid JSON only in this format:
{
  "blocks": [
    {
      "skeletonBlockId": <number>,
      "title": "<string>",
      "description": "<string>",
      "objectives": ["<string>"],
      "notes": "<string>"
    }
  ]
}`;

      const response = await anthropicService.generateChatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate a complete week plan for Week ${params.weekNumber} for ${params.gradeLevel} students. Provide content suggestions for all ${params.blocks.length} blocks.`,
          },
        ],
        4000
      );

      const data = parseJsonResponse(response);
      return { success: true, data };
    } catch (error: any) {
      console.error("Failed to generate week plan:", error);
      return { success: false, error: error.message || "Failed to generate week plan" };
    }
  }

  public async suggestBlockContent(params: {
    block: SkeletonBlock;
    gradeLevel: string;
    subjectArea?: string;
    previousContent?: string;
    schoolId: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: "AI service is not available" };
    }

    try {
      const kbContext = await getSchoolKnowledgeBaseContext(params.schoolId);

      const systemPrompt = `You are a curriculum planning expert for ${params.gradeLevel} students at an educational academy.

CONTEXT:
- Grade Level: ${params.gradeLevel}
- Block: "${params.block.defaultTitle}" (${params.block.blockType}, ${params.block.startTime}-${params.block.endTime})
- Subject Area: ${params.subjectArea || params.block.subjectArea || "General"}
${params.previousContent ? `- Previous Content: ${params.previousContent}` : ""}
${kbContext ? `\nKNOWLEDGE BASE CONTENT:\n${kbContext}` : ""}

RULES:
- Align with age-appropriate educational standards
- Build progressive difficulty week over week
- Include diverse learning activities
- Keep suggestions practical and actionable

Respond with valid JSON only in this format:
{
  "title": "<string>",
  "description": "<string>",
  "objectives": ["<string>"],
  "activities": ["<string>"]
}`;

      const response = await anthropicService.generateChatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Suggest content for the "${params.block.defaultTitle}" block for ${params.gradeLevel} students${params.subjectArea ? ` in ${params.subjectArea}` : ""}.`,
          },
        ],
        2000
      );

      const data = parseJsonResponse(response);
      return { success: true, data };
    } catch (error: any) {
      console.error("Failed to suggest block content:", error);
      return { success: false, error: error.message || "Failed to suggest block content" };
    }
  }

  public async analyzeScheduleGaps(params: {
    weekPlan: WeekPlan;
    blocks: WeekPlanBlock[];
    skeletonBlocks: SkeletonBlock[];
    gradeLevel: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: "AI service is not available" };
    }

    try {
      const blockDetails = params.blocks
        .map((b) => {
          const skeleton = params.skeletonBlocks.find(
            (sb) => sb.id === b.skeletonBlockId
          );
          return `- ${b.title || skeleton?.defaultTitle || "Untitled"}: ${b.description || "No description"}${skeleton ? ` (${skeleton.blockType}, ${skeleton.subjectArea || "General"})` : ""}`;
        })
        .join("\n");

      const emptyBlocks = params.blocks.filter(
        (b) => !b.title && !b.description
      );

      const systemPrompt = `You are a curriculum planning expert for ${params.gradeLevel} students at an educational academy.

CONTEXT:
- Grade Level: ${params.gradeLevel}
- Week Number: ${params.weekPlan.weekNumber}
- Week Status: ${params.weekPlan.status}
- Total Blocks: ${params.blocks.length}
- Empty/Unfilled Blocks: ${emptyBlocks.length}
- Current Block Content:
${blockDetails}

RULES:
- Align with age-appropriate educational standards
- Build progressive difficulty week over week
- Include diverse learning activities
- Keep suggestions practical and actionable
- Identify missing subject areas, unbalanced schedules, or gaps in learning progression

Respond with valid JSON only in this format:
{
  "gaps": ["<string>"],
  "suggestions": ["<string>"],
  "strengths": ["<string>"]
}`;

      const response = await anthropicService.generateChatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze the schedule for Week ${params.weekPlan.weekNumber} for ${params.gradeLevel} students. Identify gaps, provide improvement suggestions, and note strengths.`,
          },
        ],
        2000
      );

      const data = parseJsonResponse(response);
      return { success: true, data };
    } catch (error: any) {
      console.error("Failed to analyze schedule gaps:", error);
      return { success: false, error: error.message || "Failed to analyze schedule gaps" };
    }
  }

  public async recommendResources(params: {
    block: WeekPlanBlock;
    skeletonBlock: SkeletonBlock;
    gradeLevel: string;
    schoolId: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: "AI service is not available" };
    }

    try {
      const kbContext = await getSchoolKnowledgeBaseContext(params.schoolId);

      const systemPrompt = `You are a curriculum planning expert for ${params.gradeLevel} students at an educational academy.

CONTEXT:
- Grade Level: ${params.gradeLevel}
- Block: "${params.block.title || params.skeletonBlock.defaultTitle}" (${params.skeletonBlock.blockType})
- Subject Area: ${params.skeletonBlock.subjectArea || "General"}
- Description: ${params.block.description || params.skeletonBlock.defaultDescription || "No description"}
- Objectives: ${JSON.stringify(params.block.objectives || [])}
${kbContext ? `\nKNOWLEDGE BASE CONTENT:\n${kbContext}` : ""}

RULES:
- Align with age-appropriate educational standards
- Build progressive difficulty week over week
- Include diverse learning activities
- Keep suggestions practical and actionable
- Recommend a mix of resource types (books, videos, worksheets, online tools, hands-on materials)

Respond with valid JSON only in this format:
{
  "resources": [
    {
      "title": "<string>",
      "type": "<string>",
      "description": "<string>",
      "source": "<string>"
    }
  ]
}`;

      const response = await anthropicService.generateChatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Recommend educational resources for the "${params.block.title || params.skeletonBlock.defaultTitle}" block for ${params.gradeLevel} students in ${params.skeletonBlock.subjectArea || "General"}.`,
          },
        ],
        2000
      );

      const data = parseJsonResponse(response);
      return { success: true, data };
    } catch (error: any) {
      console.error("Failed to recommend resources:", error);
      return { success: false, error: error.message || "Failed to recommend resources" };
    }
  }
}

export const scheduleCurriculumAssistant = ScheduleCurriculumAssistant.getInstance();
