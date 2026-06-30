import type { Request } from 'express';
import { auditLogs, type InsertAuditLog } from '../../shared/schema';
import { getDb } from '../db';

export type ProgressReportAuditAction =
  | 'progress_report_generated'
  | 'progress_report_downloaded'
  | 'progress_report_emailed';

export async function logProgressReportEvent(
  req: Request,
  action: ProgressReportAuditAction,
  params: {
    childId: number;
    schoolId: number;
    schoolYear?: string;
    quarter?: string;
    snapshotId?: number;
    templateVersion?: string;
    actorId?: number;
    actorRole?: string;
    actorEmail?: string;
  },
): Promise<void> {
  try {
    const user = (req as any).user;
    const db = await getDb();
    await db.insert(auditLogs).values({
      actionType: action,
      severity: 'info',
      actorId: params.actorId ?? user?.id ?? null,
      actorRole: params.actorRole ?? user?.role ?? user?.activeRole ?? null,
      actorEmail: params.actorEmail ?? user?.email ?? null,
      targetType: 'child',
      targetId: String(params.childId),
      schoolId: params.schoolId,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        schoolYear: params.schoolYear,
        quarter: params.quarter,
        snapshotId: params.snapshotId,
        templateVersion: params.templateVersion,
      },
    } as InsertAuditLog);
  } catch (err) {
    console.error(`[progress-report-audit] Failed to log ${action}:`, err);
  }
}
