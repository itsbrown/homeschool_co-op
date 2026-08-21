import { Router, Response } from "express";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { requireRole } from "../middleware/auth0-auth";
import { insertEventSchema, type InsertEvent } from "@shared/schema";
import { filterEventsForCampuses } from "../lib/calendar-ics";
import { resolveParentCalendarScope } from "../lib/parent-calendar-scope";
import { ensureFamilyCalendarSchema } from "../lib/ensure-family-calendar-schema";
import { buildIcsCalendar } from "../lib/calendar-ics";

const router = Router();

const EVENT_COLORS: Record<string, string> = {
  class: "#3B82F6",
  meeting: "#10B981",
  holiday: "#EF4444",
  deadline: "#F97316",
  special: "#8B5CF6",
  workshop: "#06B6D4",
  camp: "#EC4899",
  other: "#6B7280",
};

const WRITE_ROLES = ["schoolAdmin", "admin", "superAdmin", "director"] as const;

function parseLocationId(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === "all") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

/** requireSchoolContext injects schoolId as a string. */
function parseSchoolId(req: { schoolId?: string | number }): number {
  return Number(req.schoolId);
}

async function ensureSchema(_req: any, _res: Response, next: () => void) {
  try {
    await ensureFamilyCalendarSchema();
  } catch (err) {
    console.error("Family calendar schema ensure failed:", err);
  }
  next();
}

router.use(ensureSchema);

router.get("/", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const events = await storage.getEventsBySchool(parseSchoolId(req));
    res.json(events);
  } catch (error) {
    console.error("Get calendar events error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.get("/range", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: "start and end date parameters required" });
    }
    const events = await storage.getEventsBySchoolAndDateRange(
      parseSchoolId(req),
      new Date(start as string),
      new Date(end as string),
    );
    res.json(events);
  } catch (error) {
    console.error("Get calendar events by range error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.get("/colors/types", supabaseAuth, async (_req: any, res: Response) => {
  res.json(EVENT_COLORS);
});

router.get("/parent/events", supabaseAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const scope = await resolveParentCalendarScope(userId);
    const { start, end } = req.query;
    const startDate = start ? new Date(start as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end as string) : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    const bySchool = await Promise.all(
      scope.schoolIds.map((schoolId) =>
        storage.getEventsBySchoolAndDateRange(schoolId, startDate, endDate),
      ),
    );
    const merged = bySchool.flat();
    res.json(filterEventsForCampuses(merged, scope.campusIds));
  } catch (error) {
    console.error("Get parent calendar events error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.post(
  "/",
  supabaseAuth,
  requireSchoolContext,
  requireRole([...WRITE_ROLES]),
  async (req: any, res: Response) => {
    try {
      const organizerId = req.user?.id;
      if (!organizerId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const parsed = insertEventSchema.safeParse({
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        schoolId: parseSchoolId(req),
        locationId: parseLocationId(req.body.locationId),
        isAllDay: Boolean(req.body.isAllDay),
        color: req.body.color || EVENT_COLORS[req.body.eventType] || EVENT_COLORS.other,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
      }

      const event = await storage.createEvent({
        ...parsed.data,
        organizerId,
        schoolId: parseSchoolId(req),
        locationId: parseLocationId(req.body.locationId),
      });
      res.status(201).json(event);
    } catch (error) {
      console.error("Create calendar event error:", error);
      res.status(500).json({ message: "Error creating calendar event" });
    }
  },
);

router.get("/:id", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid event id" });
    }
    const event = await storage.getEvent(id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (event.schoolId !== parseSchoolId(req)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(event);
  } catch (error) {
    console.error("Get calendar event error:", error);
    res.status(500).json({ message: "Error fetching calendar event" });
  }
});

router.patch(
  "/:id",
  supabaseAuth,
  requireSchoolContext,
  requireRole([...WRITE_ROLES]),
  async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (existing.schoolId !== parseSchoolId(req)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateData: Partial<InsertEvent> = { ...req.body };
      if (req.body.startDate) updateData.startDate = new Date(req.body.startDate);
      if (req.body.endDate) updateData.endDate = new Date(req.body.endDate);
      if (req.body.locationId !== undefined) {
        updateData.locationId = parseLocationId(req.body.locationId);
      }
      if (req.body.eventType && !req.body.color) {
        updateData.color = EVENT_COLORS[req.body.eventType] || EVENT_COLORS.other;
      }

      const updated = await storage.updateEvent(id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Update calendar event error:", error);
      res.status(500).json({ message: "Error updating calendar event" });
    }
  },
);

router.delete(
  "/:id",
  supabaseAuth,
  requireSchoolContext,
  requireRole([...WRITE_ROLES]),
  async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = await storage.getEvent(id);
      if (!existing) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (existing.schoolId !== parseSchoolId(req)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteEvent(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete calendar event error:", error);
      res.status(500).json({ message: "Error deleting calendar event" });
    }
  },
);

export { EVENT_COLORS, buildIcsCalendar };
export default router;
