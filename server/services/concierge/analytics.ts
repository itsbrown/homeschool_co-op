import { getDb } from "../../db";
import { conciergeEvents } from "@shared/schema";
import { sanitizeConciergeMetadata } from "./guardrails";

export type ConciergeAnalyticsInput = {
  schoolId: number | null;
  userId: number | null;
  eventType: "concierge_turn" | "concierge_tool";
  toolName?: string | null;
  ok: boolean;
  latencyMs: number;
  metadata?: Record<string, unknown>;
};

export async function logConciergeEvent(input: ConciergeAnalyticsInput): Promise<void> {
  const db = await getDb();
  await db.insert(conciergeEvents).values({
    schoolId: input.schoolId,
    userId: input.userId,
    eventType: input.eventType,
    toolName: input.toolName ?? null,
    ok: input.ok,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    metadata: sanitizeConciergeMetadata(input.metadata ?? {}),
  });
}
