import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { supabaseAuth } from "../middleware/supabase-auth";
import { storage } from "../storage";
import { resolveSchoolIdForUser } from "../lib/resolve-school-id";
import {
  insertUserActivityEvents,
  insertCheckoutFunnelEvent,
} from "../lib/school-analytics";
import { userActivityEventTypes, checkoutFunnelLanes, checkoutFunnelSteps } from "../../shared/schema";

const router = Router();

const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { message: "Too many activity events" },
});

const funnelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "Too many funnel events" },
});

const activityEventSchema = z.object({
  eventType: z.enum(userActivityEventTypes),
  path: z.string().optional(),
  durationMs: z.number().int().optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const activityBatchSchema = z.object({
  events: z.array(activityEventSchema).min(1).max(50),
});

const funnelEventSchema = z.object({
  correlationId: z.string().min(1),
  lane: z.enum(checkoutFunnelLanes),
  step: z.enum(checkoutFunnelSteps),
  parentEmail: z.string().optional(),
  enrollmentIds: z.array(z.number()).optional(),
  storeOrderId: z.number().optional(),
  classIds: z.array(z.number()).optional(),
  childIds: z.array(z.number()).optional(),
  cartValueCents: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

async function resolveSchoolIdForActivity(req: Request): Promise<number | null> {
  const user = (req as any).user;
  if (!user?.email) return null;
  const dbUser = await storage.getUserByEmail(user.email);
  if (!dbUser) return user.schoolId ?? null;
  return resolveSchoolIdForUser(dbUser);
}

router.post("/activity", supabaseAuth, activityLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = activityBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload", errors: parsed.error.errors });
    }
    const user = (req as any).user;
    const schoolId = await resolveSchoolIdForActivity(req);
    const role = user?.role || user?.activeRole;

    await insertUserActivityEvents(
      parsed.data.events.map((e) => ({
        schoolId: schoolId ?? undefined,
        userId: user?.id,
        role,
        eventType: e.eventType,
        path: e.path,
        durationMs: e.durationMs,
        sessionId: e.sessionId,
        metadata: e.metadata ?? {},
      })),
    );

    if (user?.id && parsed.data.events.some((e) => e.eventType === "login")) {
      try {
        await storage.updateUser(user.id, { lastLogin: new Date() });
      } catch {
        // non-blocking
      }
    }

    res.status(201).json({ ok: true, count: parsed.data.events.length });
  } catch (e) {
    console.error("telemetry activity:", e);
    res.status(500).json({ message: "Failed to record activity" });
  }
});

router.post("/checkout-funnel", supabaseAuth, funnelLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = funnelEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload", errors: parsed.error.errors });
    }
    const user = (req as any).user;
    const schoolId = await resolveSchoolIdForActivity(req);
    if (!schoolId) {
      return res.status(400).json({ message: "School context required" });
    }

    await insertCheckoutFunnelEvent({
      schoolId,
      correlationId: parsed.data.correlationId,
      parentId: user?.id,
      parentEmail: parsed.data.parentEmail || user?.email,
      lane: parsed.data.lane,
      step: parsed.data.step,
      enrollmentIds: parsed.data.enrollmentIds ?? [],
      storeOrderId: parsed.data.storeOrderId,
      classIds: parsed.data.classIds ?? [],
      childIds: parsed.data.childIds ?? [],
      cartValueCents: parsed.data.cartValueCents ?? 0,
      metadata: parsed.data.metadata ?? {},
    });

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("telemetry checkout-funnel:", e);
    res.status(500).json({ message: "Failed to record funnel event" });
  }
});

export default router;
