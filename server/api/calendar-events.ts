import { Router, Response } from "express";
import { storage } from "../storage";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { insertEventSchema, type InsertEvent } from '@shared/schema';

const router = Router();

const EVENT_COLORS: Record<string, string> = {
  class: '#3B82F6',
  meeting: '#10B981',
  holiday: '#EF4444',
  deadline: '#F97316',
  special: '#8B5CF6',
  workshop: '#06B6D4',
  camp: '#EC4899',
  other: '#6B7280'
};

router.get('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const events = await storage.getEventsBySchool(schoolId);
    res.json(events);
  } catch (error) {
    console.error("Get calendar events error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.get('/range', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ message: "start and end date parameters required" });
    }
    
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    
    const events = await storage.getEventsBySchoolAndDateRange(schoolId, startDate, endDate);
    res.json(events);
  } catch (error) {
    console.error("Get calendar events by range error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.get('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const event = await storage.getEvent(id);
    
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    if (event.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    res.json(event);
  } catch (error) {
    console.error("Get calendar event error:", error);
    res.status(500).json({ message: "Error fetching calendar event" });
  }
});

router.post('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const organizerId = req.user?.id;
    
    if (!organizerId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    const eventData: InsertEvent = {
      ...req.body,
      organizerId,
      schoolId,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      color: req.body.color || EVENT_COLORS[req.body.eventType] || EVENT_COLORS.other
    };
    
    const event = await storage.createEvent(eventData);
    res.status(201).json(event);
  } catch (error) {
    console.error("Create calendar event error:", error);
    res.status(500).json({ message: "Error creating calendar event" });
  }
});

router.patch('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getEvent(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const updateData: Partial<InsertEvent> = { ...req.body };
    
    if (req.body.startDate) {
      updateData.startDate = new Date(req.body.startDate);
    }
    if (req.body.endDate) {
      updateData.endDate = new Date(req.body.endDate);
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
});

router.delete('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getEvent(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    await storage.deleteEvent(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete calendar event error:", error);
    res.status(500).json({ message: "Error deleting calendar event" });
  }
});

router.get('/colors/types', supabaseAuth, async (req: any, res: Response) => {
  res.json(EVENT_COLORS);
});

router.get('/parent/events', supabaseAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const user = await storage.getUser(userId);
    if (!user?.schoolId) {
      return res.status(400).json({ message: "User not associated with a school" });
    }

    const { start, end } = req.query;
    
    let events;
    if (start && end) {
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);
      events = await storage.getEventsBySchoolAndDateRange(user.schoolId, startDate, endDate);
    } else {
      events = await storage.getEventsBySchool(user.schoolId);
    }
    
    res.json(events);
  } catch (error) {
    console.error("Get parent calendar events error:", error);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
});

router.get('/feed/:schoolId.ics', async (req: any, res: Response) => {
  try {
    const schoolId = parseInt(req.params.schoolId);
    if (isNaN(schoolId)) {
      return res.status(400).send("Invalid school ID");
    }

    const school = await storage.getSchool(schoolId);
    if (!school) {
      return res.status(404).send("School not found");
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    
    const events = await storage.getEventsBySchoolAndDateRange(schoolId, threeMonthsAgo, sixMonthsAhead);

    const formatICSDate = (date: Date, isAllDay: boolean) => {
      if (isAllDay) {
        return date.toISOString().split('T')[0].replace(/-/g, '');
      }
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const escapeICS = (str: string) => {
      return str.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    };

    const icsEvents = events.map((event: any) => [
      'BEGIN:VEVENT',
      `UID:event-${event.id}@asa-learning`,
      `DTSTAMP:${formatICSDate(new Date(), false)}`,
      event.isAllDay
        ? `DTSTART;VALUE=DATE:${formatICSDate(new Date(event.startDate), true)}`
        : `DTSTART:${formatICSDate(new Date(event.startDate), false)}`,
      event.isAllDay
        ? `DTEND;VALUE=DATE:${formatICSDate(new Date(event.endDate), true)}`
        : `DTEND:${formatICSDate(new Date(event.endDate), false)}`,
      `SUMMARY:${escapeICS(event.title)}`,
      event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
      event.location ? `LOCATION:${escapeICS(event.location)}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n'));

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//ASA Learning Platform//Calendar//EN`,
      `X-WR-CALNAME:${escapeICS(school.name)} Calendar`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...icsEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${school.name.replace(/[^a-z0-9]/gi, '_')}_calendar.ics"`);
    res.send(icsContent);
  } catch (error) {
    console.error("Generate ICS feed error:", error);
    res.status(500).send("Error generating calendar feed");
  }
});

export default router;
