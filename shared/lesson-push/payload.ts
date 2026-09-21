import { z } from "zod";
import { HALL_KEYS, resolveHallSlot, type HallKey } from "./hall-slots";

export const lessonPushPayloadSchema = z
  .object({
    hall: z.enum(HALL_KEYS),
    weekNumber: z.number().int().positive(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: z.string().min(1).optional(),
    slotKey: z.string().min(1).optional(),
    driveFileId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    objectives: z.array(z.string()).default([]),
    materials: z.array(z.string()).default([]),
    homework: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lessonLink: z.string().nullable().optional(),
    resources: z.array(z.string()).default([]),
    updatedBy: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.slotKey) return;
    if (value.dayOfWeek == null || !value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide slotKey, or both dayOfWeek and startTime",
      });
    }
  });

export type LessonPushPayload = z.infer<typeof lessonPushPayloadSchema>;

export function parseLessonPushPayload(raw: unknown): LessonPushPayload {
  return lessonPushPayloadSchema.parse(raw);
}

export function resolvePayloadSlot(payload: LessonPushPayload) {
  const hall = payload.hall as HallKey;
  if (payload.slotKey) {
    return resolveHallSlot(hall, { slotKey: payload.slotKey });
  }
  return resolveHallSlot(hall, {
    dayOfWeek: payload.dayOfWeek!,
    startTime: payload.startTime!,
  });
}
