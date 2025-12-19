import { Router, Response } from "express";
import { storage } from "../storage";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { insertNotificationSchema, type InsertNotification } from '@shared/schema';

const router = Router();

router.get('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const announcements = await storage.getAnnouncementsBySchool(schoolId);
    res.json(announcements);
  } catch (error) {
    console.error("Get announcements error:", error);
    res.status(500).json({ message: "Error fetching announcements" });
  }
});

router.get('/pinned', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const pinnedAnnouncements = await storage.getPinnedAnnouncementsBySchool(schoolId);
    res.json(pinnedAnnouncements);
  } catch (error) {
    console.error("Get pinned announcements error:", error);
    res.status(500).json({ message: "Error fetching pinned announcements" });
  }
});

router.get('/active', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.user?.id;
    const activeAnnouncements = await storage.getActiveAnnouncementsForUser(userId, schoolId);
    res.json(activeAnnouncements);
  } catch (error) {
    console.error("Get active announcements error:", error);
    res.status(500).json({ message: "Error fetching active announcements" });
  }
});

router.get('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const announcement = await storage.getNotificationById(id);
    
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    
    if (announcement.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    res.json(announcement);
  } catch (error) {
    console.error("Get announcement error:", error);
    res.status(500).json({ message: "Error fetching announcement" });
  }
});

router.post('/', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const senderId = req.user?.id;
    
    if (!senderId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    const announcementData: InsertNotification = {
      ...req.body,
      senderId,
      schoolId,
      isAnnouncement: true,
      status: req.body.status || 'draft',
      targetData: req.body.targetData || {}
    };
    
    const announcement = await storage.createNotification(announcementData);
    res.status(201).json(announcement);
  } catch (error) {
    console.error("Create announcement error:", error);
    res.status(500).json({ message: "Error creating announcement" });
  }
});

router.patch('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getNotificationById(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const updated = await storage.updateNotification(id, req.body);
    res.json(updated);
  } catch (error) {
    console.error("Update announcement error:", error);
    res.status(500).json({ message: "Error updating announcement" });
  }
});

router.delete('/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getNotificationById(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    await storage.deleteNotification(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json({ message: "Error deleting announcement" });
  }
});

router.post('/:id/publish', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getNotificationById(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const updated = await storage.updateNotification(id, {
      status: 'sent',
      sentAt: new Date()
    } as any);
    
    res.json(updated);
  } catch (error) {
    console.error("Publish announcement error:", error);
    res.status(500).json({ message: "Error publishing announcement" });
  }
});

router.post('/:id/pin', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getNotificationById(id);
    
    if (!existing) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    
    if (existing.schoolId !== req.schoolId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const updated = await storage.updateNotification(id, {
      isPinned: !existing.isPinned
    } as any);
    
    res.json(updated);
  } catch (error) {
    console.error("Toggle pin announcement error:", error);
    res.status(500).json({ message: "Error toggling pin on announcement" });
  }
});

export default router;
