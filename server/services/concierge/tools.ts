import { z } from "zod";
import { STORE_ATTENDEE_TYPES, STORE_MEAL_TYPES } from "@shared/store-event-rsvp";
import { logConciergeEvent } from "./analytics";
import { getMyFamily, getWeekMaterials } from "./family";
import { startEnrollmentInquiry } from "./inquiry";
import { rsvpEvent } from "./rsvp";
import { isConciergeToolName, toolsForActor, type ConciergeToolName } from "./tool-names";

export type ConciergeActor = {
  userId: number | null;
  schoolId: number | null;
};

const familyArgs = z.object({
  childId: z.number().int().positive().optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strip();

const rsvpArgs = z.object({
  eventProductId: z.number().int().positive(),
  attendees: z.array(z.object({
    type: z.enum(STORE_ATTENDEE_TYPES),
    quantity: z.number().int().min(0),
  })),
  meals: z.array(z.object({
    type: z.enum(STORE_MEAL_TYPES),
    quantity: z.number().int().min(0),
  })).optional(),
  otherNote: z.string().max(240).nullable().optional(),
}).strip();

const inquiryArgs = z.object({
  question: z.string().trim().min(1).max(2000),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
}).strip();

export async function executeConciergeTool(
  name: string,
  rawArgs: unknown,
  actor: ConciergeActor,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  const allowed = toolsForActor(actor.userId != null);
  let result: Record<string, unknown>;

  if (!isConciergeToolName(name) || !allowed.includes(name)) {
    result = { ok: false, error: "That action is not available." };
  } else {
    result = await runTool(name, rawArgs, actor);
  }

  try {
    await logConciergeEvent({
      schoolId: actor.schoolId,
      userId: actor.userId,
      eventType: "concierge_tool",
      toolName: isConciergeToolName(name) ? name : null,
      ok: result.ok !== false,
      latencyMs: Date.now() - started,
      metadata: {
        handoff: result.handoff === true,
      },
    });
  } catch (error) {
    console.error("[concierge] tool analytics failed:", error instanceof Error ? error.message : error);
  }

  return result;
}

async function runTool(
  name: ConciergeToolName,
  rawArgs: unknown,
  actor: ConciergeActor,
): Promise<Record<string, unknown>> {
  if (name === "get_my_family" || name === "get_week_materials") {
    if (actor.userId == null) {
      return { ok: false, error: "Sign in to see your own family. I can't look up anyone else." };
    }
    const parsed = familyArgs.safeParse(rawArgs ?? {});
    const childId = parsed.success ? parsed.data.childId : undefined;
    if (name === "get_my_family") {
      const family = await getMyFamily(actor.userId, childId);
      return family as unknown as Record<string, unknown>;
    }
    const weekStart = parsed.success ? parsed.data.weekStart : undefined;
    const materials = await getWeekMaterials(actor.userId, { weekStart, childId });
    return materials as unknown as Record<string, unknown>;
  }

  if (name === "rsvp_event") {
    if (actor.userId == null) {
      return { ok: false, error: "Sign in to RSVP. I can only record an RSVP for the signed-in parent." };
    }
    const parsed = rsvpArgs.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return { ok: false, handoff: false, error: "Tell me which event and how many people are coming." };
    }
    const { eventProductId, ...answer } = parsed.data;
    const saved = await rsvpEvent(actor.userId, {
      attendees: answer.attendees,
      meals: answer.meals ?? [],
      otherNote: answer.otherNote ?? null,
    }, eventProductId);
    return saved as unknown as Record<string, unknown>;
  }

  const parsed = inquiryArgs.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, handoff: true, error: "Share the question, and your name and email if you are not signed in." };
  }
  const inquiry = await startEnrollmentInquiry(actor.userId, parsed.data);
  return inquiry as unknown as Record<string, unknown>;
}
