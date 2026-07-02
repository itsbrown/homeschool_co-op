import { apiRequest } from "./queryClient";

const SESSION_KEY = "asa_activity_session_id";
const CORRELATION_KEY = "asa_checkout_correlation_id";

export function getActivitySessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getCheckoutCorrelationId(): string {
  let id = sessionStorage.getItem(CORRELATION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CORRELATION_KEY, id);
  }
  return id;
}

export function resetCheckoutCorrelationId(): void {
  sessionStorage.removeItem(CORRELATION_KEY);
}

type ActivityEvent = {
  eventType: "login" | "page_view" | "session_start" | "session_end" | "heartbeat";
  path?: string;
  durationMs?: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

let pendingEvents: ActivityEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushActivityEvents(): Promise<void> {
  if (!pendingEvents.length) return;
  const batch = [...pendingEvents];
  pendingEvents = [];
  const token = localStorage.getItem("supabase_token");
  if (!token) return;
  try {
    await apiRequest("POST", "/api/telemetry/activity", {
      events: batch.map((e) => ({
        ...e,
        sessionId: e.sessionId || getActivitySessionId(),
      })),
    });
  } catch {
    pendingEvents.unshift(...batch);
  }
}

export function queueActivityEvent(event: ActivityEvent): void {
  const token = localStorage.getItem("supabase_token");
  if (!token) return;
  pendingEvents.push({
    ...event,
    sessionId: event.sessionId || getActivitySessionId(),
  });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushActivityEvents();
  }, 2000);
}

export async function recordCheckoutFunnelStep(payload: {
  step: "add_to_cart" | "view_cart" | "begin_checkout" | "add_payment_info" | "purchase" | "abandon";
  lane?: "member_cart" | "public_store";
  parentEmail?: string;
  enrollmentIds?: number[];
  storeOrderId?: number;
  classIds?: number[];
  childIds?: number[];
  cartValueCents?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const token = localStorage.getItem("supabase_token");
  if (!token) return;
  try {
    await apiRequest("POST", "/api/telemetry/checkout-funnel", {
      correlationId: getCheckoutCorrelationId(),
      lane: payload.lane || "member_cart",
      ...payload,
    });
    if (payload.step === "purchase") {
      resetCheckoutCorrelationId();
    }
  } catch (e) {
    console.warn("checkout funnel telemetry failed", e);
  }
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let sessionStart = Date.now();

export function startActivityHeartbeat(): void {
  if (heartbeatInterval) return;
  sessionStart = Date.now();
  queueActivityEvent({ eventType: "session_start", path: window.location.pathname });
  heartbeatInterval = setInterval(() => {
    if (document.visibilityState === "visible") {
      queueActivityEvent({ eventType: "heartbeat", path: window.location.pathname });
    }
  }, 30000);

  const onHide = () => {
    const durationMs = Date.now() - sessionStart;
    queueActivityEvent({
      eventType: "session_end",
      path: window.location.pathname,
      durationMs,
    });
    void flushActivityEvents();
  };

  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
}

export function recordLoginActivity(): void {
  queueActivityEvent({ eventType: "login", path: window.location.pathname });
  void flushActivityEvents();
}
