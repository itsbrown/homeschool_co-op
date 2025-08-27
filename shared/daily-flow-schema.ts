
import { z } from "zod";

// Daily Flow Template Schema
export const dailyFlowTemplateSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  schoolId: z.number(),
  gradeLevel: z.string(),
  subject: z.string(),
  createdBy: z.string(),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

// Daily Flow Entry Schema
export const dailyFlowEntrySchema = z.object({
  id: z.number().optional(),
  templateId: z.number().optional(),
  classId: z.number(),
  date: z.string(), // YYYY-MM-DD format
  startTime: z.string(), // HH:MM format
  endTime: z.string(), // HH:MM format
  subject: z.string(),
  lessonTitle: z.string(),
  lessonDescription: z.string().optional(),
  lessonLink: z.string().url().optional(),
  materials: z.array(z.string()).optional(),
  objectives: z.array(z.string()).optional(),
  isCompleted: z.boolean().default(false),
  completedBy: z.string().optional(),
  completedAt: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string(),
  lastModifiedBy: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

// Daily Flow Schedule Schema (for recurring patterns)
export const dailyFlowScheduleSchema = z.object({
  id: z.number().optional(),
  templateId: z.number(),
  classId: z.number(),
  dayOfWeek: z.number().min(0).max(6), // 0 = Sunday, 6 = Saturday
  startTime: z.string(),
  endTime: z.string(),
  subject: z.string(),
  lessonTitle: z.string(),
  lessonDescription: z.string().optional(),
  lessonLink: z.string().url().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export type DailyFlowTemplate = z.infer<typeof dailyFlowTemplateSchema>;
export type DailyFlowEntry = z.infer<typeof dailyFlowEntrySchema>;
export type DailyFlowSchedule = z.infer<typeof dailyFlowScheduleSchema>;
