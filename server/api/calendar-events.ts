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

export default router;
