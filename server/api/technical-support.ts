import type { Express } from "express";
import { AITechnicalSupportService } from "../lib/ai-technical-support.js";
import { storage } from "../storage.js";

interface TechnicalIssue {
  id: string;
  userEmail: string;
  userRole: string;
  issueType: 'navigation' | 'payment' | 'ui' | 'performance' | 'authentication' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  userAgent: string;
  url: string;
  browserInfo: {
    browser: string;
    version: string;
    platform: string;
  };
  reproductionSteps: string[];
  recommendedActions: string[];
  timestamp: Date;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  assignedTo?: string;
  resolution?: string;
}

const aiSupport = new AITechnicalSupportService();

export function registerTechnicalSupportRoutes(app: Express) {
  // Report a technical issue with AI analysis
  app.post('/api/technical-support/report', async (req, res) => {
    try {
      const {
        description,
        userEmail,
        userRole,
        currentUrl,
        userAgent,
        browserInfo,
        attemptedActions
      } = req.body;

      if (!description || !userEmail) {
        return res.status(400).json({
          success: false,
          error: 'Description and user email are required'
        });
      }

      // AI analysis of the issue
      const analysis = await aiSupport.analyzeUserIssue({
        description,
        userEmail,
        userRole: userRole || 'parent',
        currentUrl: currentUrl || '',
        userAgent: userAgent || '',
        browserInfo: browserInfo || {},
        attemptedActions: attemptedActions || []
      });

      // Create issue record
      const issue: TechnicalIssue = {
        id: aiSupport.generateIssueId(),
        userEmail,
        userRole: userRole || 'parent',
        issueType: analysis.issueType,
        severity: analysis.severity,
        title: `${analysis.issueType} issue: ${description.substring(0, 50)}...`,
        description,
        userAgent: userAgent || '',
        url: currentUrl || '',
        browserInfo: browserInfo || {},
        reproductionSteps: analysis.reproductionSteps,
        recommendedActions: analysis.recommendedActions,
        timestamp: new Date(),
        status: 'open'
      };

      // Store issue
      await storage.createTechnicalIssue(issue);

      // Generate user-friendly response
      const userFirstName = userEmail.split('@')[0];
      const userResponse = await aiSupport.generateUserResponse({
        diagnosis: analysis.diagnosis,
        recommendedActions: analysis.recommendedActions,
        userFirstName
      });

      // Notify admins if needed
      if (analysis.requiresAdminNotification) {
        await storage.createAdminNotification({
          id: `TECH-NOTIF-${Date.now()}`,
          type: 'technical_issue',
          title: `Technical Issue: ${analysis.issueType}`,
          message: aiSupport.formatIssueForAdmin(issue),
          severity: analysis.severity,
          targetRole: 'school_admin',
          createdAt: new Date(),
          read: false,
          actionRequired: true,
          relatedId: issue.id
        });
      }

      res.json({
        success: true,
        issueId: issue.id,
        diagnosis: analysis.diagnosis,
        userResponse,
        recommendedActions: analysis.recommendedActions,
        severity: analysis.severity,
        trackingEnabled: true
      });

    } catch (error) {
      console.error('Technical support error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process technical support request'
      });
    }
  });

  // Get issue status for user tracking
  app.get('/api/technical-support/issue/:issueId', async (req, res) => {
    try {
      const { issueId } = req.params;
      const issue = await storage.getTechnicalIssue(issueId);

      if (!issue) {
        return res.status(404).json({
          success: false,
          error: 'Issue not found'
        });
      }

      res.json({
        success: true,
        issue: {
          id: issue.id,
          status: issue.status,
          title: issue.title,
          description: issue.description,
          timestamp: issue.timestamp,
          resolution: issue.resolution,
          recommendedActions: issue.recommendedActions
        }
      });

    } catch (error) {
      console.error('Issue lookup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve issue status'
      });
    }
  });

  // System health check for proactive monitoring
  app.get('/api/technical-support/system-health', async (req, res) => {
    try {
      const healthCheck = await aiSupport.checkSystemHealth();
      
      res.json({
        success: true,
        ...healthCheck
      });

    } catch (error) {
      console.error('System health check error:', error);
      res.status(500).json({
        success: false,
        overallHealth: 'critical',
        error: 'Health check failed'
      });
    }
  });

  // Admin: Get all technical issues
  app.get('/api/admin/technical-issues', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const issues = await storage.getAllTechnicalIssues();

      res.json({
        success: true,
        issues: issues.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      });

    } catch (error) {
      console.error('Admin issues lookup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve technical issues'
      });
    }
  });

  // Admin: Update issue status
  app.patch('/api/admin/technical-issues/:issueId', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { issueId } = req.params;
      const { status, resolution, assignedTo } = req.body;

      const updatedIssue = await storage.updateTechnicalIssue(issueId, {
        status,
        resolution,
        assignedTo
      });

      if (!updatedIssue) {
        return res.status(404).json({
          success: false,
          error: 'Issue not found'
        });
      }

      // Notify user of status change
      if (status === 'resolved' && resolution) {
        await storage.createUserNotification({
          id: `USER-NOTIF-${Date.now()}`,
          userEmail: updatedIssue.userEmail,
          type: 'issue_resolved',
          title: 'Technical Issue Resolved',
          message: `Your technical issue (${updatedIssue.id}) has been resolved: ${resolution}`,
          createdAt: new Date(),
          read: false
        });
      }

      res.json({
        success: true,
        issue: updatedIssue
      });

    } catch (error) {
      console.error('Issue update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update issue'
      });
    }
  });
}