import { Router, Response } from "express";
import { storage } from "../storage";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { insertNotificationSchema, type InsertNotification } from '@shared/schema';
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const savedAudiencesCache = new Map<number, Array<{id: number, name: string, targetType: string, targetClassId: number | null, schoolId: number}>>();
let savedAudienceIdCounter = 1;

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

router.post('/ai/resolve-audience', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const { query } = req.body;
    const schoolId = req.schoolId;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: "Query is required" });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("AI audience resolution error: ANTHROPIC_API_KEY not configured");
      return res.status(503).json({ 
        message: "AI service not available",
        fallback: { targetType: 'all_parents', targetClassId: null }
      });
    }

    const classes = await storage.getClassesBySchool(schoolId);
    const classNames = classes.map((c: any) => `${c.name} (ID: ${c.id})`).join(', ');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are an audience targeting assistant for a school management system. 
Your job is to interpret natural language descriptions of target audiences and convert them to structured targeting parameters.

Available target types:
- all_parents: All parent accounts at the school
- enrolled_parents: Parents who have children currently enrolled in classes
- unenrolled_parents: Parents who have registered children but none are enrolled in any class
- class_specific: Parents of children enrolled in a specific class (requires classId)
- missed_payments: Parents who have outstanding payment balances
- all: Everyone (all users at the school)

Available classes at this school: ${classNames || 'No classes available'}

Respond ONLY with valid JSON in this format:
{
  "targetType": "one of the types above",
  "targetClassId": null or number if class_specific,
  "confidence": 0.0 to 1.0,
  "interpretation": "brief explanation of what you understood",
  "suggestions": ["alternative targeting option 1", "alternative targeting option 2"]
}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Parse this audience description and return the structured targeting: "${query}"`
      }],
      system: systemPrompt
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error("Unexpected response format from AI");
    }

    let result;
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("AI audience resolution parse error:", parseError, "Raw response:", content.text);
      return res.status(500).json({ 
        message: "Failed to parse AI response",
        fallback: { targetType: 'all_parents', targetClassId: null }
      });
    }

    console.log(`AI audience resolution: "${query}" -> ${result.targetType} (confidence: ${result.confidence})`);
    
    res.json({
      targetType: result.targetType,
      targetClassId: result.targetClassId || null,
      confidence: result.confidence,
      interpretation: result.interpretation,
      suggestions: result.suggestions || []
    });
  } catch (error) {
    console.error("AI audience resolution error:", error);
    res.status(500).json({ 
      message: "Error resolving audience",
      fallback: { targetType: 'all_parents', targetClassId: null }
    });
  }
});

router.get('/saved-audiences', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const savedAudiences = savedAudiencesCache.get(schoolId) || [];
    res.json(savedAudiences);
  } catch (error) {
    console.error("Get saved audiences error:", error);
    res.json([]);
  }
});

router.post('/saved-audiences', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = req.schoolId;
    const { name, targetType, targetClassId } = req.body;
    
    if (!name || !targetType) {
      return res.status(400).json({ message: "Name and targetType are required" });
    }
    
    const savedAudience = {
      id: savedAudienceIdCounter++,
      name,
      targetType,
      targetClassId: targetClassId || null,
      schoolId
    };
    
    const existing = savedAudiencesCache.get(schoolId) || [];
    existing.push(savedAudience);
    savedAudiencesCache.set(schoolId, existing);
    
    res.status(201).json(savedAudience);
  } catch (error) {
    console.error("Create saved audience error:", error);
    res.status(500).json({ message: "Error saving audience" });
  }
});

router.delete('/saved-audiences/:id', supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = req.schoolId;
    
    const existing = savedAudiencesCache.get(schoolId) || [];
    const filtered = existing.filter(a => a.id !== id);
    savedAudiencesCache.set(schoolId, filtered);
    res.status(204).send();
  } catch (error) {
    console.error("Delete saved audience error:", error);
    res.status(500).json({ message: "Error deleting saved audience" });
  }
});

export default router;
