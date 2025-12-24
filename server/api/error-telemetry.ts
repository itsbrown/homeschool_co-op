import express from "express";
import { z } from "zod";
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { errorNotificationService } from '../services/error-notification';

const router = express.Router();

const frontendErrorSchema = z.object({
  message: z.string(),
  stackTrace: z.string().optional(),
  url: z.string().optional(),
  route: z.string().optional(),
  errorCode: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  metadata: z.record(z.any()).optional(),
});

const backendErrorSchema = z.object({
  message: z.string(),
  stackTrace: z.string().optional(),
  route: z.string().optional(),
  method: z.string().optional(),
  errorCode: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  errorType: z.enum(['frontend', 'backend', 'api', 'database', 'auth', 'payment', 'unknown']).default('backend'),
  userId: z.number().optional(),
  userEmail: z.string().optional(),
  schoolId: z.number().optional(),
  requestBody: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post("/frontend", async (req, res) => {
  try {
    const parsed = frontendErrorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid error data", details: parsed.error.issues });
    }

    const { message, stackTrace, url, route, errorCode, severity, metadata } = parsed.data;

    let userId: number | undefined;
    let userEmail: string | undefined;
    let schoolId: number | undefined;

    try {
      const email = (req as any).auth?.payload?.email || (req as any).user?.email;
      if (email) {
        userEmail = email;
        const user = await storage.getUserByEmail(email);
        if (user) {
          userId = user.id;
          schoolId = user.schoolId ?? undefined;
        }
      }
    } catch (e) {
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const errorLog = await storage.createErrorLog({
      errorType: 'frontend',
      severity,
      message,
      stackTrace: stackTrace ?? null,
      errorCode: errorCode ?? null,
      url: url ?? null,
      route: route ?? null,
      method: null,
      userId: userId ?? null,
      userEmail: userEmail ?? null,
      schoolId: schoolId ?? null,
      ipAddress,
      userAgent,
      requestBody: null,
      metadata: metadata || {},
      status: 'new',
      notificationSent: false,
    });

    if (severity === 'critical' || severity === 'high') {
      errorNotificationService.sendImmediateNotification(errorLog).catch(e => {
        console.error('[ErrorTelemetry] Failed to send immediate notification:', e);
      });
    }

    res.json({ success: true, errorId: errorLog.id });
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error logging frontend error:', error);
    res.status(500).json({ error: "Failed to log error" });
  }
});

router.post("/backend", async (req, res) => {
  try {
    const parsed = backendErrorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid error data", details: parsed.error.issues });
    }

    const {
      message, stackTrace, route, method, errorCode, severity,
      errorType, userId, userEmail, schoolId, requestBody, metadata
    } = parsed.data;

    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const errorLog = await storage.createErrorLog({
      errorType,
      severity,
      message,
      stackTrace: stackTrace ?? null,
      errorCode: errorCode ?? null,
      url: null,
      route: route ?? null,
      method: method ?? null,
      userId: userId ?? null,
      userEmail: userEmail ?? null,
      schoolId: schoolId ?? null,
      ipAddress,
      userAgent,
      requestBody: requestBody ?? null,
      metadata: metadata || {},
      status: 'new',
      notificationSent: false,
    });

    if (severity === 'critical' || severity === 'high') {
      errorNotificationService.sendImmediateNotification(errorLog).catch(e => {
        console.error('[ErrorTelemetry] Failed to send immediate notification:', e);
      });
    }

    res.json({ success: true, errorId: errorLog.id });
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error logging backend error:', error);
    res.status(500).json({ error: "Failed to log error" });
  }
});

router.get("/", supabaseAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superAdmin' && user.role !== 'schoolAdmin')) {
      return res.status(403).json({ error: "Unauthorized - admin access required" });
    }

    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    const errorType = req.query.errorType as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const errors = await storage.getErrorLogs({ severity, status, errorType, startDate, endDate, limit, offset });
    const totalCount = await storage.getErrorLogsCount({ severity, status, errorType, startDate, endDate });

    res.json({
      errors,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      }
    });
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error fetching error logs:', error);
    res.status(500).json({ error: "Failed to fetch error logs" });
  }
});

router.get("/summary", supabaseAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superAdmin' && user.role !== 'schoolAdmin')) {
      return res.status(403).json({ error: "Unauthorized - admin access required" });
    }

    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();

    const summary = await storage.getErrorsSummary(startDate, endDate);

    res.json(summary);
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error fetching error summary:', error);
    res.status(500).json({ error: "Failed to fetch error summary" });
  }
});

router.patch("/:id", supabaseAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superAdmin' && user.role !== 'schoolAdmin')) {
      return res.status(403).json({ error: "Unauthorized - admin access required" });
    }

    const errorId = parseInt(req.params.id);
    if (isNaN(errorId)) {
      return res.status(400).json({ error: "Invalid error ID" });
    }

    const { status, resolutionNotes } = req.body;

    const updates: any = {};
    if (status) updates.status = status;
    if (resolutionNotes !== undefined) updates.resolutionNotes = resolutionNotes;
    
    if (status === 'resolved') {
      updates.resolvedBy = user.id;
      updates.resolvedAt = new Date();
    }

    const updated = await storage.updateErrorLog(errorId, updates);
    if (!updated) {
      return res.status(404).json({ error: "Error log not found" });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error updating error log:', error);
    res.status(500).json({ error: "Failed to update error log" });
  }
});

router.get("/:id", supabaseAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superAdmin' && user.role !== 'schoolAdmin')) {
      return res.status(403).json({ error: "Unauthorized - admin access required" });
    }

    const errorId = parseInt(req.params.id);
    if (isNaN(errorId)) {
      return res.status(400).json({ error: "Invalid error ID" });
    }

    const errorLog = await storage.getErrorLogById(errorId);
    if (!errorLog) {
      return res.status(404).json({ error: "Error log not found" });
    }

    res.json(errorLog);
  } catch (error: any) {
    console.error('[ErrorTelemetry] Error fetching error log:', error);
    res.status(500).json({ error: "Failed to fetch error log" });
  }
});

export default router;
