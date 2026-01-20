import type { Express } from "express";
import { AITechnicalSupportService } from "../lib/ai-technical-support";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";

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

      // Create admin notification if needed
      if (analysis.requiresAdminNotification) {
        try {
          // Find admin users from both users.role AND userRoles table for comprehensive detection
          const allUsers = await storage.getAllUsers();
          
          // Build set of admin user IDs - check primary role first
          const adminUserIds = new Set<number>();
          for (const user of allUsers) {
            // Check primary role
            if (user.role === 'admin' || user.role === 'schoolAdmin' || user.role === 'superAdmin') {
              adminUserIds.add(user.id);
              continue;
            }
            // Check secondary roles in userRoles table
            const userRoles = await storage.getUserRolesByUserId(user.id);
            if (userRoles.some(ur => ur.role === 'admin' || ur.role === 'schoolAdmin' || ur.role === 'superAdmin')) {
              adminUserIds.add(user.id);
            }
          }
          
          const adminUsers = allUsers.filter(u => adminUserIds.has(u.id));
          const senderId = adminUsers[0]?.id || 1;
          
          if (adminUsers.length === 0) {
            console.warn('⚠️ No admin users found to notify about technical issue');
          }
          
          // Create notification for admins
          const notification = await storage.createNotification({
            senderId,
            type: 'in_app',
            priority: analysis.severity === 'critical' ? 'high' : 'normal',
            subject: `Technical Issue: ${analysis.issueType}`,
            content: `User ${userEmail} reported: ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}`,
            targetType: 'role',
            targetData: { role: 'schoolAdmin', issueId: issue.id },
            scheduledFor: null,
            expiresAt: null
          });
          
          // Create notification recipients for all admin users
          for (const admin of adminUsers) {
            try {
              await storage.createNotificationRecipient({
                notificationId: notification.id,
                recipientId: admin.id,
                deliveryType: 'in_app',
                status: 'pending'
              });
            } catch (recipientError) {
              console.error(`Failed to create recipient for admin ${admin.id}:`, recipientError);
            }
          }
          console.log(`📬 Created ${adminUsers.length} notification recipients for technical issue`);
          
          // Also log to error monitoring for tracking
          await storage.createErrorLog({
            errorType: 'frontend',
            severity: analysis.severity === 'critical' ? 'high' : 'medium',
            route: currentUrl || '/technical-support',
            method: 'POST',
            message: `Technical Issue: ${analysis.issueType} - ${issue.title}`,
            stackTrace: aiSupport.formatIssueForAdmin(issue),
            userEmail: userEmail,
            metadata: { issueId: issue.id, notificationId: notification.id }
          });
          
          console.log(`📢 Created admin notification ${notification.id} for technical issue ${issue.id}`);
        } catch (notifError) {
          console.error('Failed to create admin notification:', notifError);
        }
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

  // Admin: Get all technical issues (requires admin role)
  app.get('/api/admin/technical-issues', supabaseAuth, async (req: any, res) => {
    try {
      // Verify admin role (check both users.role AND userRoles table)
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }
      
      // Check if user has admin role in either users.role or userRoles table
      const userRolesForUser = await storage.getUserRolesByUserId(user.id);
      const hasAdminRole = 
        user.role === 'admin' || user.role === 'schoolAdmin' || user.role === 'superAdmin' ||
        userRolesForUser.some(ur => ur.role === 'admin' || ur.role === 'schoolAdmin' || ur.role === 'superAdmin');
      
      if (!hasAdminRole) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
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

  // Admin: Update issue status (requires admin role)
  app.patch('/api/admin/technical-issues/:issueId', supabaseAuth, async (req: any, res) => {
    try {
      // Verify admin role (check both users.role AND userRoles table)
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }
      
      // Check if user has admin role in either users.role or userRoles table
      const userRolesForUser = await storage.getUserRolesByUserId(user.id);
      const hasAdminRole = 
        user.role === 'admin' || user.role === 'schoolAdmin' || user.role === 'superAdmin' ||
        userRolesForUser.some(ur => ur.role === 'admin' || ur.role === 'schoolAdmin' || ur.role === 'superAdmin');
      
      if (!hasAdminRole) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
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

      // Log resolution to error monitoring for tracking
      if (status === 'resolved' && resolution) {
        console.log(`✅ Technical issue ${updatedIssue.id} resolved for ${updatedIssue.userEmail}: ${resolution}`);
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