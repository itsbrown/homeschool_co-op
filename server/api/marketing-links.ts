import express from "express";
import { storage } from "../storage";
import { insertMarketingLinkSchema, insertLinkAnalyticsSchema } from "@shared/schema";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import crypto from "crypto";

const router = express.Router();

// Generate unique campaign ID
function generateCampaignId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// Generate QR code URL (using a free QR code service)
function generateQRCodeUrl(campaignId: string, schoolId: number): string {
  const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
  const enrollUrl = `https://${baseUrl}/school/${schoolId}/enroll/${campaignId}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(enrollUrl)}`;
}

// Create marketing link
router.post("/", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    // Validate request data
    const validatedData = insertMarketingLinkSchema.parse({
      ...req.body,
      schoolId,
      campaignId: generateCampaignId(),
    });

    // Create marketing link
    const marketingLink = await storage.createMarketingLink(validatedData);

    // Generate QR code URL
    const qrCodeUrl = generateQRCodeUrl(marketingLink.campaignId, marketingLink.schoolId);
    
    // Update with QR code URL
    const updatedLink = await storage.updateMarketingLink(marketingLink.id, { qrCodeUrl });

    // Generate full tracking URL
    const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
    const trackingUrl = `https://${baseUrl}/school/${marketingLink.schoolId}/enroll/${marketingLink.campaignId}?utm_source=school&utm_medium=marketing_link&utm_campaign=${marketingLink.campaignName.toLowerCase().replace(/\s+/g, '_')}`;

    res.json({
      ...updatedLink,
      trackingUrl,
      shortUrl: `https://${baseUrl}/l/${marketingLink.campaignId}`
    });
  } catch (error) {
    console.error("Error creating marketing link:", error);
    res.status(500).json({ error: "Failed to create marketing link" });
  }
});

// Get marketing links for a school
router.get("/", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;
    
    const links = await storage.getMarketingLinksBySchoolId(schoolId);
    
    // Add tracking URLs to each link
    const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
    const enrichedLinks = links.map(link => ({
      ...link,
      trackingUrl: `https://${baseUrl}/school/${link.schoolId}/enroll/${link.campaignId}?utm_source=school&utm_medium=marketing_link&utm_campaign=${link.campaignName.toLowerCase().replace(/\s+/g, '_')}`,
      shortUrl: `https://${baseUrl}/l/${link.campaignId}`
    }));

    res.json(enrichedLinks);
  } catch (error) {
    console.error("Error fetching marketing links:", error);
    res.status(500).json({ error: "Failed to fetch marketing links" });
  }
});

// Get marketing link by ID
router.get("/:id", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const id = parseInt(req.params.id);
    const link = await storage.getMarketingLinkById(id);
    
    if (!link) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    // Verify link belongs to user's school
    if (link.schoolId !== schoolId) {
      return res.status(403).json({ error: "Not authorized to access marketing links from other schools" });
    }

    // Add tracking URL
    const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
    const trackingUrl = `https://${baseUrl}/school/${link.schoolId}/enroll/${link.campaignId}?utm_source=school&utm_medium=marketing_link&utm_campaign=${link.campaignName.toLowerCase().replace(/\s+/g, '_')}`;

    res.json({
      ...link,
      trackingUrl,
      shortUrl: `https://${baseUrl}/l/${link.campaignId}`
    });
  } catch (error) {
    console.error("Error fetching marketing link:", error);
    res.status(500).json({ error: "Failed to fetch marketing link" });
  }
});

// Update marketing link
router.put("/:id", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const id = parseInt(req.params.id);
    
    // Verify link belongs to user's school before updating
    const existingLink = await storage.getMarketingLinkById(id);
    if (!existingLink) {
      return res.status(404).json({ error: "Marketing link not found" });
    }
    if (existingLink.schoolId !== schoolId) {
      return res.status(403).json({ error: "Not authorized to update marketing links from other schools" });
    }

    const validatedData = insertMarketingLinkSchema.partial().parse(req.body);
    const updatedLink = await storage.updateMarketingLink(id, validatedData);
    
    if (!updatedLink) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    // Add tracking URL
    const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
    const trackingUrl = `https://${baseUrl}/school/${updatedLink.schoolId}/enroll/${updatedLink.campaignId}?utm_source=school&utm_medium=marketing_link&utm_campaign=${updatedLink.campaignName.toLowerCase().replace(/\s+/g, '_')}`;

    res.json({
      ...updatedLink,
      trackingUrl,
      shortUrl: `https://${baseUrl}/l/${updatedLink.campaignId}`
    });
  } catch (error) {
    console.error("Error updating marketing link:", error);
    res.status(500).json({ error: "Failed to update marketing link" });
  }
});

// Delete marketing link
router.delete("/:id", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const id = parseInt(req.params.id);
    
    // Verify link belongs to user's school before deleting
    const existingLink = await storage.getMarketingLinkById(id);
    if (!existingLink) {
      return res.status(404).json({ error: "Marketing link not found" });
    }
    if (existingLink.schoolId !== schoolId) {
      return res.status(403).json({ error: "Not authorized to delete marketing links from other schools" });
    }

    const deleted = await storage.deleteMarketingLink(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting marketing link:", error);
    res.status(500).json({ error: "Failed to delete marketing link" });
  }
});

// Track link click (public endpoint)
router.get("/track/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const link = await storage.getMarketingLinkByCampaignId(campaignId);
    
    if (!link) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Record analytics
    await storage.createLinkAnalytics({
      linkId: link.id,
      event: 'click',
      ipAddress: req.ip || null,
      userAgent: req.get('User-Agent') || null,
      referrer: req.get('Referer') || null
    });

    // Redirect to enrollment page
    const enrollmentUrl = `/school/${link.schoolId}/enroll/${campaignId}?utm_source=${link.utmSource}&utm_medium=${link.utmMedium}&utm_campaign=${link.utmCampaign}`;
    res.redirect(enrollmentUrl);
  } catch (error) {
    console.error("Error tracking link click:", error);
    res.status(500).json({ error: "Failed to track link" });
  }
});

// Get analytics for a marketing link
router.get("/:id/analytics", supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    const id = parseInt(req.params.id);
    
    // Verify link belongs to user's school before showing analytics
    const link = await storage.getMarketingLinkById(id);
    if (!link) {
      return res.status(404).json({ error: "Marketing link not found" });
    }
    if (link.schoolId !== schoolId) {
      return res.status(403).json({ error: "Not authorized to view analytics from other schools" });
    }

    const analytics = await storage.getLinkAnalytics(id);
    
    // Calculate summary statistics
    const totalClicks = analytics.filter(a => a.event === 'click').length;
    const totalConversions = analytics.filter(a => a.event === 'conversion').length;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    res.json({
      totalClicks,
      totalConversions,
      conversionRate: Math.round(conversionRate * 100) / 100,
      analytics: analytics.map(a => ({
        ...a,
        timestamp: a.timestamp.toISOString()
      }))
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;