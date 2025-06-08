import express from "express";
import { storage } from "../storage";
import { insertMarketingLinkSchema, insertLinkAnalyticsSchema } from "@shared/schema";
import { validateAuth } from "../middleware/auth";
import crypto from "crypto";

const router = express.Router();

// Generate unique campaign ID
function generateCampaignId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// Generate QR code URL (placeholder for now - would integrate with QR service)
function generateQRCodeUrl(campaignId: string, schoolId: number): string {
  const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
  const linkUrl = `https://${baseUrl}/school/${schoolId}/enroll/${campaignId}`;
  // In production, this would call a QR code generation service
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkUrl)}`;
}

// Create new marketing link
router.post("/", validateAuth, async (req, res) => {
  try {
    const userPayload = req.auth as any;
    
    // Verify user is school admin
    if (userPayload.role !== 'schoolAdmin') {
      return res.status(403).json({ error: "Only school administrators can create marketing links" });
    }

    // Get user's school ID
    const user = await storage.getUserByEmail(userPayload.email);
    if (!user || !user.schoolId) {
      return res.status(404).json({ error: "School not found for user" });
    }

    // Validate request body
    const validatedData = insertMarketingLinkSchema.parse({
      ...req.body,
      schoolId: user.schoolId,
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
    const trackingUrl = `https://${baseUrl}/school/${marketingLink.schoolId}/enroll/${marketingLink.campaignId}?utm_source=${marketingLink.utmSource}&utm_medium=${marketingLink.utmMedium}&utm_campaign=${marketingLink.utmCampaign}`;

    res.json({
      ...updatedLink,
      trackingUrl,
      shortUrl: `https://${baseUrl}/ml/${marketingLink.campaignId}`, // Short URL for social media
    });
  } catch (error) {
    console.error("Error creating marketing link:", error);
    res.status(500).json({ error: "Failed to create marketing link" });
  }
});

// Get all marketing links for school
router.get("/", validateAuth, async (req, res) => {
  try {
    const userPayload = req.auth as any;
    
    // Verify user is school admin
    if (userPayload.role !== 'schoolAdmin') {
      return res.status(403).json({ error: "Only school administrators can view marketing links" });
    }

    // Get user's school ID
    const user = await storage.getUserByEmail(userPayload.email);
    if (!user || !user.schoolId) {
      return res.status(404).json({ error: "School not found for user" });
    }

    const marketingLinks = await storage.getMarketingLinksBySchoolId(user.schoolId);
    
    // Add tracking URLs to each link
    const baseUrl = process.env.REPLIT_DOMAIN || 'localhost:5000';
    const linksWithUrls = marketingLinks.map(link => ({
      ...link,
      trackingUrl: `https://${baseUrl}/school/${link.schoolId}/enroll/${link.campaignId}?utm_source=${link.utmSource}&utm_medium=${link.utmMedium}&utm_campaign=${link.utmCampaign}`,
      shortUrl: `https://${baseUrl}/ml/${link.campaignId}`,
    }));

    res.json({ links: linksWithUrls });
  } catch (error) {
    console.error("Error fetching marketing links:", error);
    res.status(500).json({ error: "Failed to fetch marketing links" });
  }
});

// Get analytics for specific marketing link
router.get("/:linkId/analytics", validateAuth, async (req, res) => {
  try {
    const userPayload = req.auth as any;
    const linkId = parseInt(req.params.linkId);
    
    // Verify user is school admin
    if (userPayload.role !== 'schoolAdmin') {
      return res.status(403).json({ error: "Only school administrators can view analytics" });
    }

    // Get user's school ID
    const user = await storage.getUserByEmail(userPayload.email);
    if (!user || !user.schoolId) {
      return res.status(404).json({ error: "School not found for user" });
    }

    // Verify link belongs to user's school
    const marketingLink = await storage.getMarketingLinkById(linkId);
    if (!marketingLink || marketingLink.schoolId !== user.schoolId) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    // Get date range from query params
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const analytics = await storage.getLinkAnalyticsByLinkId(linkId, start, end);

    // Aggregate analytics data
    const aggregated = {
      totalClicks: analytics.filter(a => a.actionType === 'click').length,
      totalPageViews: analytics.filter(a => a.actionType === 'page_view').length,
      enrollmentStarted: analytics.filter(a => a.actionType === 'enrollment_started').length,
      enrollmentCompleted: analytics.filter(a => a.actionType === 'enrollment_completed').length,
      conversionRate: 0,
      recentActivity: analytics.slice(-10).reverse(), // Last 10 activities
      dailyStats: aggregateDailyStats(analytics),
    };

    if (aggregated.totalClicks > 0) {
      aggregated.conversionRate = (aggregated.enrollmentCompleted / aggregated.totalClicks) * 100;
    }

    res.json({
      link: marketingLink,
      analytics: aggregated,
    });
  } catch (error) {
    console.error("Error fetching marketing link analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Update marketing link
router.put("/:linkId", validateAuth, async (req, res) => {
  try {
    const userPayload = req.auth as any;
    const linkId = parseInt(req.params.linkId);
    
    // Verify user is school admin
    if (userPayload.role !== 'schoolAdmin') {
      return res.status(403).json({ error: "Only school administrators can update marketing links" });
    }

    // Get user's school ID
    const user = await storage.getUserByEmail(userPayload.email);
    if (!user || !user.schoolId) {
      return res.status(404).json({ error: "School not found for user" });
    }

    // Verify link belongs to user's school
    const existingLink = await storage.getMarketingLinkById(linkId);
    if (!existingLink || existingLink.schoolId !== user.schoolId) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    // Update marketing link
    const updatedLink = await storage.updateMarketingLink(linkId, req.body);
    if (!updatedLink) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    res.json(updatedLink);
  } catch (error) {
    console.error("Error updating marketing link:", error);
    res.status(500).json({ error: "Failed to update marketing link" });
  }
});

// Delete marketing link
router.delete("/:linkId", validateAuth, async (req, res) => {
  try {
    const userPayload = req.auth as any;
    const linkId = parseInt(req.params.linkId);
    
    // Verify user is school admin
    if (userPayload.role !== 'schoolAdmin') {
      return res.status(403).json({ error: "Only school administrators can delete marketing links" });
    }

    // Get user's school ID
    const user = await storage.getUserByEmail(userPayload.email);
    if (!user || !user.schoolId) {
      return res.status(404).json({ error: "School not found for user" });
    }

    // Verify link belongs to user's school
    const existingLink = await storage.getMarketingLinkById(linkId);
    if (!existingLink || existingLink.schoolId !== user.schoolId) {
      return res.status(404).json({ error: "Marketing link not found" });
    }

    await storage.deleteMarketingLink(linkId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting marketing link:", error);
    res.status(500).json({ error: "Failed to delete marketing link" });
  }
});

// Track link interaction (public endpoint)
router.put("/track/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { actionType, sessionId, metadata } = req.body;
    
    // Get marketing link
    const marketingLink = await storage.getMarketingLinkByCampaignId(campaignId);
    if (!marketingLink || !marketingLink.isActive) {
      return res.status(404).json({ error: "Marketing link not found or inactive" });
    }

    // Check expiration
    if (marketingLink.expirationDate && new Date() > marketingLink.expirationDate) {
      return res.status(410).json({ error: "Marketing link has expired" });
    }

    // Extract request metadata
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers.referer;
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Create analytics record
    await storage.createLinkAnalytics({
      linkId: marketingLink.id,
      actionType,
      userAgent,
      referrer,
      ipAddress,
      sessionId,
      metadata,
    });

    // Update click/conversion counters
    if (actionType === 'click') {
      await storage.incrementLinkClick(campaignId);
    } else if (actionType === 'enrollment_completed') {
      await storage.incrementLinkConversion(campaignId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking link interaction:", error);
    res.status(500).json({ error: "Failed to track interaction" });
  }
});

// Helper function to aggregate daily stats
function aggregateDailyStats(analytics: any[]) {
  const dailyStats: { [key: string]: any } = {};
  
  analytics.forEach(record => {
    const date = record.timestamp.toISOString().split('T')[0];
    
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        clicks: 0,
        pageViews: 0,
        enrollmentStarted: 0,
        enrollmentCompleted: 0,
      };
    }
    
    switch (record.actionType) {
      case 'click':
        dailyStats[date].clicks++;
        break;
      case 'page_view':
        dailyStats[date].pageViews++;
        break;
      case 'enrollment_started':
        dailyStats[date].enrollmentStarted++;
        break;
      case 'enrollment_completed':
        dailyStats[date].enrollmentCompleted++;
        break;
    }
  });
  
  return Object.values(dailyStats).sort((a: any, b: any) => a.date.localeCompare(b.date));
}

export default router;