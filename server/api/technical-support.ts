import type { Express } from "express";
import { AITechnicalSupportService } from "../lib/ai-technical-support";
import { notifySupportIssueRecipients, type SupportIssueCategory } from "../lib/support-issue-notifications";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { fileUploadService } from "../services/fileUploadService";

const aiSupport = new AITechnicalSupportService();

const PLATFORM_ROLES = new Set(['admin', 'superAdmin']);

async function resolveAdminContext(email: string) {
  const user = await storage.getUserByEmail(email);
  if (!user) return null;

  const userRoles = await storage.getUserRolesByUserId(user.id);
  const isPlatformAdmin =
    PLATFORM_ROLES.has(user.role) ||
    userRoles.some((r) => PLATFORM_ROLES.has(r.role));

  const schoolAdminRole = userRoles.find((r) => r.role === 'schoolAdmin' || r.role === 'director');
  const schoolId = schoolAdminRole?.schoolId ?? user.schoolId ?? null;

  const isSchoolAdmin =
    !isPlatformAdmin &&
    (user.role === 'schoolAdmin' ||
      userRoles.some((r) => r.role === 'schoolAdmin' || r.role === 'director'));

  return { user, userRoles, isPlatformAdmin, isSchoolAdmin, schoolId };
}

async function listIssuesForAdmin(email: string) {
  const ctx = await resolveAdminContext(email);
  if (!ctx) return { issues: [], ctx: null };

  const { isPlatformAdmin, isSchoolAdmin, schoolId } = ctx;
  if (!isPlatformAdmin && !isSchoolAdmin) {
    return { issues: [], ctx };
  }

  let issues;
  if (isPlatformAdmin) {
    issues = await storage.getAllTechnicalIssues();
  } else if (isSchoolAdmin && schoolId) {
    issues = await storage.getTechnicalIssuesBySchoolId(schoolId);
  } else {
    issues = [];
  }

  return {
    ctx,
    issues: issues.sort(
      (a, b) => new Date(b.timestamp ?? b.createdAt).getTime() - new Date(a.timestamp ?? a.createdAt).getTime(),
    ),
  };
}

export function registerTechnicalSupportRoutes(app: Express) {
  app.post('/api/technical-support/report', supabaseAuth, async (req: any, res) => {
    try {
      const {
        description,
        userRole: bodyRole,
        currentUrl,
        userAgent,
        browserInfo,
        attemptedActions,
        issueCategory: rawCategory,
        screenshotObjectPath,
      } = req.body;

      const authEmail = req.user?.email;
      if (!authEmail) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (!description?.trim()) {
        return res.status(400).json({ success: false, error: 'Description is required' });
      }

      const user = await storage.getUserByEmail(authEmail);
      const userEmail = authEmail;
      const userRole = bodyRole || user?.role || 'parent';
      const schoolId = user?.schoolId ?? null;

      const issueCategory: SupportIssueCategory =
        rawCategory === 'school_policy' ? 'school_policy' : 'platform';

      if (issueCategory === 'school_policy' && !schoolId) {
        return res.status(400).json({
          success: false,
          error: 'Your account is not linked to a school. Use platform support for technical issues.',
        });
      }

      const useFastAnalysis =
        process.env.NODE_ENV === 'test' || process.env.TESTING_FAST_SUPPORT === 'true';

      const analysis = useFastAnalysis
        ? {
            diagnosis: 'Automated test analysis stub.',
            issueType: 'other' as const,
            severity: 'medium' as const,
            recommendedActions: [
              'Try refreshing the page',
              'Clear your browser cache',
              'Contact support if the issue persists',
            ],
            reproductionSteps: ['Reproduce in test environment'],
            requiresAdminNotification: true,
          }
        : await aiSupport.analyzeUserIssue({
            description: description.trim(),
            userEmail,
            userRole,
            currentUrl: currentUrl || '',
            userAgent: userAgent || '',
            browserInfo: browserInfo || {},
            attemptedActions: attemptedActions || [],
          });

      const issueId = aiSupport.generateIssueId();
      const userFirstName = userEmail.split('@')[0];
      const userResponse = useFastAnalysis
        ? `Hi ${userFirstName}, we've received your report and our team is reviewing it. Try refreshing the page while you wait.`
        : await aiSupport.generateUserResponse({
            diagnosis: analysis.diagnosis,
            recommendedActions: analysis.recommendedActions,
            userFirstName,
          });

      const issueRecord = {
        id: issueId,
        userId: user?.id ?? null,
        userEmail,
        userRole,
        schoolId: issueCategory === 'school_policy' ? schoolId : schoolId,
        issueCategory,
        issueType: analysis.issueType,
        severity: analysis.severity,
        title: `${analysis.issueType} issue: ${description.substring(0, 50)}...`,
        description: description.trim(),
        userAgent: userAgent || '',
        url: currentUrl || '',
        browserInfo: browserInfo || {},
        reproductionSteps: analysis.reproductionSteps,
        recommendedActions: analysis.recommendedActions,
        aiDiagnosis: analysis.diagnosis,
        aiUserResponse: userResponse,
        screenshotObjectPath: screenshotObjectPath || null,
        status: 'open' as const,
      };

      await storage.createTechnicalIssue(issueRecord);

      try {
        await notifySupportIssueRecipients({
          issue: {
            ...issueRecord,
            timestamp: new Date(),
            reproductionSteps: analysis.reproductionSteps,
            recommendedActions: analysis.recommendedActions,
          },
          issueCategory,
          schoolId,
        });
      } catch (notifError) {
        console.error('Failed to notify support recipients:', notifError);
      }

      try {
        await storage.createErrorLog({
          errorType: 'frontend',
          severity: analysis.severity === 'critical' ? 'high' : 'medium',
          route: currentUrl || '/technical-support',
          method: 'POST',
          message: `Support Issue (${issueCategory}): ${analysis.issueType} - ${issueRecord.title}`,
          stackTrace: aiSupport.formatIssueForAdmin({
            ...issueRecord,
            timestamp: new Date(),
            reproductionSteps: analysis.reproductionSteps,
            recommendedActions: analysis.recommendedActions,
          }),
          userEmail,
          schoolId: schoolId ?? undefined,
          metadata: { issueId, issueCategory, screenshotObjectPath: screenshotObjectPath ?? null },
        });
      } catch (logError) {
        console.error('Failed to log support issue to error monitoring:', logError);
      }

      res.json({
        success: true,
        issueId,
        issueCategory,
        diagnosis: analysis.diagnosis,
        userResponse,
        recommendedActions: analysis.recommendedActions,
        severity: analysis.severity,
        trackingEnabled: true,
      });
    } catch (error) {
      console.error('Technical support error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process technical support request',
      });
    }
  });

  app.get('/api/technical-support/issue/:issueId', supabaseAuth, async (req: any, res) => {
    try {
      const { issueId } = req.params;
      const issue = await storage.getTechnicalIssue(issueId);

      if (!issue) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }

      const authEmail = req.user?.email;
      if (issue.userEmail !== authEmail) {
        const ctx = authEmail ? await resolveAdminContext(authEmail) : null;
        if (!ctx?.isPlatformAdmin && !ctx?.isSchoolAdmin) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
      }

      res.json({
        success: true,
        issue: {
          id: issue.id,
          status: issue.status,
          title: issue.title,
          description: issue.description,
          timestamp: issue.timestamp ?? issue.createdAt,
          resolution: issue.resolution,
          recommendedActions: issue.recommendedActions,
          issueCategory: issue.issueCategory,
        },
      });
    } catch (error) {
      console.error('Issue lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve issue status' });
    }
  });

  app.get('/api/technical-support/system-health', async (_req, res) => {
    try {
      const healthCheck = await aiSupport.checkSystemHealth();
      res.json({ success: true, ...healthCheck });
    } catch (error) {
      console.error('System health check error:', error);
      res.status(500).json({
        success: false,
        overallHealth: 'critical',
        error: 'Health check failed',
      });
    }
  });

  app.get('/api/admin/technical-issues', supabaseAuth, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { issues, ctx } = await listIssuesForAdmin(userEmail);
      if (!ctx || (!ctx.isPlatformAdmin && !ctx.isSchoolAdmin)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const issuesWithScreenshots = await Promise.all(
        issues.map(async (issue) => {
          let screenshotUrl: string | null = null;
          if (issue.screenshotObjectPath) {
            screenshotUrl = await fileUploadService.getSignedDownloadUrl(issue.screenshotObjectPath);
          }
          return { ...issue, screenshotUrl };
        }),
      );

      res.json({ success: true, issues: issuesWithScreenshots });
    } catch (error) {
      console.error('Admin issues lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve technical issues' });
    }
  });

  app.patch('/api/admin/technical-issues/:issueId', supabaseAuth, async (req: any, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const ctx = await resolveAdminContext(userEmail);
      if (!ctx || (!ctx.isPlatformAdmin && !ctx.isSchoolAdmin)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const { issueId } = req.params;
      const existing = await storage.getTechnicalIssue(issueId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }

      if (ctx.isSchoolAdmin && !ctx.isPlatformAdmin) {
        if (existing.issueCategory !== 'school_policy' || existing.schoolId !== ctx.schoolId) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
      }

      const { status, resolution, assignedTo } = req.body;
      const updatedIssue = await storage.updateTechnicalIssue(issueId, {
        status,
        resolution,
        assignedTo,
      });

      if (!updatedIssue) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }

      if (status === 'resolved' && resolution) {
        console.log(`✅ Support issue ${updatedIssue.id} resolved for ${updatedIssue.userEmail}: ${resolution}`);
      }

      res.json({ success: true, issue: updatedIssue });
    } catch (error) {
      console.error('Issue update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update issue' });
    }
  });
}
