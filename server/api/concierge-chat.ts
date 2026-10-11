import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { runConciergeChat } from "../services/concierge/chat";
import { attachPreviewDemoUser } from "../services/concierge/preview-auth";
import { assertPreviewDemoAllowed, isPreviewDemoRequested, PreviewDemoRefused } from "../services/concierge/preview-demo-guard";

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment before asking again." },
});

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  })).min(1).max(20),
}).strip();

function optionalSupabaseAuth(req: any, res: any, next: any) {
  if (isPreviewDemoRequested()) {
    try {
      assertPreviewDemoAllowed();
    } catch (error) {
      const message = error instanceof PreviewDemoRefused ? error.message : "Preview demo is not available.";
      return res.status(503).json({ error: message });
    }
    attachPreviewDemoUser(req);
    return next();
  }
  const hasBearer = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ");
  const hasTestUser = process.env.NODE_ENV === "test" && req.headers["x-test-user-email"];
  const hasSession = Boolean(req.session?.userId);
  if (!hasBearer && !hasTestUser && !hasSession) return next();
  return supabaseAuth(req, res, next);
}

router.post("/chat", chatLimiter, optionalSupabaseAuth, async (req: any, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Send a short message to start." });
  }
  const latest = parsed.data.messages[parsed.data.messages.length - 1];
  if (latest.role !== "user") {
    return res.status(400).json({ error: "The latest message must be from you." });
  }

  const userId = typeof req.user?.id === "number" ? req.user.id : null;
  const schoolId = typeof req.user?.schoolId === "number" ? req.user.schoolId : null;

  try {
    const result = await runConciergeChat(
      { userId, schoolId },
      parsed.data.messages,
    );
    return res.json(result);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      return res.status(503).json({
        error: "The concierge model is not configured. Set AI_GATEWAY_API_KEY on the server.",
      });
    }
    console.error("[concierge] chat failed:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "The concierge could not answer just now." });
  }
});

export default router;
