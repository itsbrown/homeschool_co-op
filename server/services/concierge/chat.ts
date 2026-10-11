import { answerFromEnrollmentCorpus } from "./enrollment-corpus";
import { logConciergeEvent } from "./analytics";
import { detectSensitiveRequest, handoffMessage } from "./guardrails";
import { gatewayModelId, resolveConciergeMode } from "./mode";
import { buildConciergeSystemPrompt } from "./prompts";
import { executeConciergeTool, type ConciergeActor } from "./tools";
import { isConciergeToolName, toolsForActor, type ConciergeToolName } from "./tool-names";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ConciergeChatResult = {
  reply: string;
  handoff: boolean;
  toolsUsed: string[];
  analyticsLogged: boolean;
  mode: string;
};

const TOOL_LINE = /^tool:([a-z_]+)(?:\s+(\{[\s\S]*\}))?\s*$/;

const FAMILY_TOOLS = new Set<ConciergeToolName>(["get_my_family", "get_week_materials", "rsvp_event"]);

function summarizeTool(result: Record<string, unknown>): string {
  if (typeof result.message === "string") return result.message;
  if (typeof result.error === "string") return result.error;
  if (result.ok === true && result.weekStart && Array.isArray(result.children)) {
    const titles = (result.children as Array<{ classTitle?: string; blocks?: Array<{ title?: string | null }> }>)
      .flatMap((row) => [row.classTitle, ...(row.blocks ?? []).map((block) => block.title)])
      .filter(Boolean);
    return titles.length
      ? `Week of ${result.weekStart}: ${titles.join("; ")}.`
      : `I didn't find published materials for the week of ${result.weekStart}.`;
  }
  if (result.ok === true && Array.isArray(result.children)) {
    const names = (result.children as Array<{ firstName?: string }>).map((child) => child.firstName).filter(Boolean);
    return names.length ? `Your children: ${names.join(", ")}.` : "I didn't find any children on this account.";
  }
  if (result.ok === true && result.orderId) {
    return `You're RSVP'd for ${result.eventName}. There is no charge.`;
  }
  return "Done.";
}

async function runMock(actor: ConciergeActor, latest: string): Promise<{ reply: string; handoff: boolean; toolsUsed: string[] }> {
  const toolMatch = latest.match(TOOL_LINE);
  if (toolMatch) {
    const name = toolMatch[1];
    if (!actor.userId && FAMILY_TOOLS.has(name as ConciergeToolName)) {
      const grounded = answerFromEnrollmentCorpus("sign in parent login account");
      return { reply: grounded.text, handoff: false, toolsUsed: [] };
    }
    let args: unknown = {};
    if (toolMatch[2]) {
      try {
        args = JSON.parse(toolMatch[2]);
      } catch {
        return { reply: "I couldn't read that request.", handoff: false, toolsUsed: [] };
      }
    }
    const result = await executeConciergeTool(name, args, actor);
    const handoff = result.handoff === true || detectSensitiveRequest(latest) != null;
    return {
      reply: summarizeTool(result),
      handoff,
      toolsUsed: isConciergeToolName(name) && toolsForActor(actor.userId != null).includes(name) ? [name] : [],
    };
  }

  if (!actor.userId) {
    const grounded = answerFromEnrollmentCorpus(latest);
    return { reply: grounded.text, handoff: false, toolsUsed: [] };
  }

  return {
    reply: "I can look up your family, this week's class materials, or RSVP you to a free event. I can't take payment or change an enrollment.",
    handoff: false,
    toolsUsed: [],
  };
}

async function runGateway(
  actor: ConciergeActor,
  messages: ChatMessage[],
): Promise<{ reply: string; handoff: boolean; toolsUsed: string[] }> {
  const { generateText, tool, stepCountIs } = await import("ai");
  const { createGateway } = await import("@ai-sdk/gateway");
  const { z } = await import("zod");
  const { STORE_ATTENDEE_TYPES, STORE_MEAL_TYPES } = await import("@shared/store-event-rsvp");

  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
  const signedIn = actor.userId != null;
  const allowed = new Set(toolsForActor(signedIn));
  const tools: Record<string, unknown> = {};

  const wrap = (name: string, description: string, schema: unknown) => {
    if (!allowed.has(name as never)) return;
    tools[name] = tool({
      description,
      inputSchema: schema as never,
      execute: async (input: unknown) => executeConciergeTool(name, input, actor),
    });
  };

  wrap("get_my_family", "Load the signed-in parent's own children, grades, campus, and enrollment status.", z.object({
    childId: z.number().int().positive().optional(),
  }));
  wrap("get_week_materials", "Published week-plan blocks for the signed-in parent's enrolled classes.", z.object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    childId: z.number().int().positive().optional(),
  }));
  wrap("rsvp_event", "RSVP the signed-in parent to a free store event. Priced events are a handoff.", z.object({
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
  }));
  wrap(
    "start_enrollment_inquiry",
    "Email Corey the parent's question. Does not enroll a child or take payment.",
    z.object({
      question: z.string().min(1).max(2000),
      contactName: z.string().max(120).optional(),
      contactEmail: z.string().max(200).optional(),
      contactPhone: z.string().max(40).optional(),
    }),
  );

  const result = await generateText({
    model: gateway(gatewayModelId()),
    system: buildConciergeSystemPrompt(signedIn),
    messages,
    tools: tools as never,
    stopWhen: stepCountIs(4),
  });

  const toolsUsed = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
  const handoff = result.steps.some((step) =>
    step.toolResults.some((call) => {
      const output = call.output as { handoff?: boolean } | undefined;
      return output?.handoff === true;
    }),
  );

  return {
    reply: result.text || "I don't have a reply for that.",
    handoff,
    toolsUsed,
  };
}

export async function runConciergeChat(actor: ConciergeActor, messages: ChatMessage[]): Promise<ConciergeChatResult> {
  const started = Date.now();
  const latest = messages[messages.length - 1]?.content ?? "";
  const sensitive = messages.map((message) => detectSensitiveRequest(message.content)).find(Boolean) ?? null;
  const mode = resolveConciergeMode();

  let reply = "";
  let handoff = false;
  let toolsUsed: string[] = [];

  if (sensitive) {
    reply = handoffMessage(sensitive.code);
    handoff = true;
  } else if (mode === "unconfigured") {
    const error = new Error("AI_GATEWAY_API_KEY is not set");
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  } else if (mode === "mock") {
    const mocked = await runMock(actor, latest);
    reply = mocked.reply;
    handoff = mocked.handoff;
    toolsUsed = mocked.toolsUsed;
  } else {
    const live = await runGateway(actor, messages);
    reply = live.reply;
    handoff = live.handoff;
    toolsUsed = live.toolsUsed;
  }

  let analyticsLogged = true;
  try {
    await logConciergeEvent({
      schoolId: actor.schoolId,
      userId: actor.userId,
      eventType: "concierge_turn",
      ok: true,
      latencyMs: Date.now() - started,
      metadata: {
        anonymous: actor.userId == null,
        handoff,
        handoffCode: sensitive?.code ?? null,
        messageChars: latest.length,
        mode,
        toolCount: toolsUsed.length,
      },
    });
  } catch (error) {
    analyticsLogged = false;
    console.error("[concierge] turn analytics failed:", error instanceof Error ? error.message : error);
  }

  return { reply, handoff, toolsUsed, analyticsLogged, mode };
}
