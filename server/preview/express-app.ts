import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { runConciergeChat } from "../services/concierge/chat";
import {
  attachPreviewDemoUser,
  previewDemoCookie,
  previewRequestIsHttps,
} from "../services/concierge/preview-auth";
import { previewDemoParentByKey } from "../services/concierge/preview-memory";
import { assertPreviewDemoAllowed, PreviewDemoRefused } from "../services/concierge/preview-demo-guard";

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  })).min(1).max(20),
}).strip();

const signInSchema = z.object({
  parentKey: z.enum(["avery", "blake", "casey"]),
}).strip();

/**
 * Express app for the Vercel preview only.
 * It does not import the Replit server entry or the Supabase auth middleware.
 */
export function createPreviewExpressApp() {
  assertPreviewDemoAllowed();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "preview-demo" });
  });

  app.get("/api/preview-demo/session", (req, res) => {
    attachPreviewDemoUser(req);
    const id = req.user?.id;
    const match = (["avery", "blake", "casey"] as const)
      .map((key) => previewDemoParentByKey(key))
      .find((row) => row?.id === id);
    if (!match) return res.json({ signedIn: false, parent: null });
    return res.json({
      signedIn: true,
      parent: { id: match.id, name: match.name, email: match.email },
    });
  });

  app.post("/api/preview-demo/sign-in", (req, res) => {
    const parsed = signInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Choose a fake parent." });
    }
    const parent = previewDemoParentByKey(parsed.data.parentKey);
    if (!parent) return res.status(404).json({ error: "That demo parent does not exist." });
    res.setHeader("Set-Cookie", previewDemoCookie(parent.id, false, previewRequestIsHttps(req)));
    return res.json({
      signedIn: true,
      parent: { id: parent.id, name: parent.name, email: parent.email },
    });
  });

  app.post("/api/preview-demo/sign-out", (req, res) => {
    res.setHeader("Set-Cookie", previewDemoCookie(0, true, previewRequestIsHttps(req)));
    return res.json({ signedIn: false });
  });

  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a moment before asking again." },
  });

  app.post("/api/concierge/chat", chatLimiter, async (req, res) => {
    try {
      assertPreviewDemoAllowed();
    } catch (error) {
      const message = error instanceof PreviewDemoRefused ? error.message : "Preview demo is not available.";
      return res.status(503).json({ error: message });
    }
    attachPreviewDemoUser(req);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Send a short message to start." });
    const latest = parsed.data.messages[parsed.data.messages.length - 1];
    if (latest.role !== "user") return res.status(400).json({ error: "The latest message must be from you." });
    const userId = typeof req.user?.id === "number" ? req.user.id : null;
    const schoolId = typeof req.user?.schoolId === "number" ? req.user.schoolId : null;
    try {
      const result = await runConciergeChat({ userId, schoolId }, parsed.data.messages);
      return res.json(result);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 503) {
        return res.status(503).json({
          error: "The concierge model is not configured. Set AI_GATEWAY_API_KEY on the server.",
        });
      }
      console.error("[concierge-preview] chat failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "The concierge could not answer just now." });
    }
  });

  return app;
}
