import { isPreviewDemoRequested } from "./preview-demo-guard";

export type ConciergeModelMode = "mock" | "gateway" | "unconfigured";

/** AI Gateway key is read from the environment. This module never stores a key. */
export function resolveConciergeMode(): ConciergeModelMode {
  if (process.env.CONCIERGE_AI_MOCK === "1") return "mock";
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (key) return "gateway";
  if (isPreviewDemoRequested()) return "mock";
  return "unconfigured";
}

export function gatewayModelId(): string {
  const configured = process.env.AI_GATEWAY_MODEL?.trim();
  return configured || "anthropic/claude-sonnet-4.5";
}
