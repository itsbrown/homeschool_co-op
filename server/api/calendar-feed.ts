import { randomBytes } from "crypto";
import { Router, Response } from "express";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { buildFamilyClassScheduleEvents } from "../lib/family-class-schedule";
import { resolveParentCalendarScope } from "../lib/parent-calendar-scope";
import { filterEventsForCampuses } from "../lib/calendar-ics";
import { buildIcsCalendar, type IcsEventInput } from "../lib/calendar-ics";
import { ensureFamilyCalendarSchema } from "../lib/ensure-family-calendar-schema";

const router = Router();

function combineDateAndTime(dateYmd: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10) || 0);
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

async function familyIcsForUser(userId: number, email: string | undefined): Promise<string> {
  const children = email
    ? await storage.getChildrenByParentEmail(email)
    : await storage.getChildrenByParentId(userId);
  const classEvents = await buildFamilyClassScheduleEvents({ children });
  const scope = await resolveParentCalendarScope(userId);
  const now = new Date();
  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const schoolEvents = (
    await Promise.all(
      scope.schoolIds.map((id) => storage.getEventsBySchoolAndDateRange(id, start, end)),
    )
  ).flat();
  const visibleSchoolEvents = filterEventsForCampuses(schoolEvents, scope.campusIds);

  const icsEvents: IcsEventInput[] = [
    ...classEvents.map((ev) => ({
      uid: `${ev.id}@asa-learning`,
      title: `${ev.title}${ev.childName ? ` (${ev.childName})` : ""}`,
      description: ev.description,
      location: ev.location,
      start: combineDateAndTime(ev.date, ev.startTime || "09:00"),
      end: combineDateAndTime(ev.date, ev.endTime || "12:00"),
      isAllDay: false,
    })),
    ...visibleSchoolEvents.map((ev) => ({
      uid: `event-${ev.id}@asa-learning`,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      start: new Date(ev.startDate),
      end: new Date(ev.endDate),
      isAllDay: Boolean(ev.isAllDay),
    })),
  ];

  return buildIcsCalendar("ASA Family Calendar", icsEvents);
}

router.post("/feed-token", supabaseAuth, async (req: any, res: Response) => {
  try {
    await ensureFamilyCalendarSchema();
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });
    const rotate = req.body?.rotate === true;
    const existing = await storage.getUser(userId);
    if (!rotate && existing?.calendarFeedToken) {
      return res.json({ token: existing.calendarFeedToken });
    }
    const token = randomBytes(24).toString("hex");
    await storage.setUserCalendarFeedToken(userId, token);
    res.json({ token });
  } catch (error) {
    console.error("Mint calendar feed token error:", error);
    res.status(500).json({ message: "Error creating calendar feed" });
  }
});

router.get("/feed/:token", async (req: any, res: Response) => {
  try {
    await ensureFamilyCalendarSchema();
    const raw = String(req.params.token || "");
    const token = raw.replace(/\.ics$/i, "");
    if (!token) {
      return res.status(400).send("Invalid token");
    }
    const user = await storage.getUserByCalendarFeedToken(token);
    if (!user) {
      return res.status(404).send("Calendar not found");
    }
    const ics = await familyIcsForUser(user.id, user.email);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", 'attachment; filename="asa-family-calendar.ics"');
    res.send(ics);
  } catch (error) {
    console.error("Family calendar feed error:", error);
    res.status(500).send("Error generating calendar feed");
  }
});

export default router;
