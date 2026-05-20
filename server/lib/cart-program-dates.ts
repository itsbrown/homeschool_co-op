/**
 * Resolve program start/end dates for cart lines (classes, variants, F001 sessions, enrollments).
 * Used by cart payment-plan display and should match enrollment program_* fields at checkout.
 */

import { eq } from 'drizzle-orm';
import { sessions } from '@shared/schema';
import { getDb } from '../db';
import { storage } from '../storage';
import type { CartItem } from '../utils/cart-pricing';

export interface ProgramDateSpan {
  earliestStartDate: Date | null;
  latestEndDate: Date | null;
}

export function parseProgramDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeSpan(
  span: ProgramDateSpan,
  startDate: Date | null,
  endDate: Date | null,
): ProgramDateSpan {
  let { earliestStartDate, latestEndDate } = span;
  if (startDate && (!earliestStartDate || startDate < earliestStartDate)) {
    earliestStartDate = startDate;
  }
  if (endDate && (!latestEndDate || endDate > latestEndDate)) {
    latestEndDate = endDate;
  }
  return { earliestStartDate, latestEndDate };
}

async function loadEnrollmentSessionById(
  sessionId: number,
): Promise<{ startDate: unknown; endDate: unknown } | null> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({
        startDate: sessions.startDate,
        endDate: sessions.endDate,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort dates for one cart line. Session (F001) dates take precedence over class dates
 * when both are present; enrollment record fills gaps when the line references an existing row.
 */
export async function resolveCartItemProgramDates(
  item: CartItem,
): Promise<{ startDate: Date | null; endDate: Date | null }> {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  const enrollmentId = Number(item.enrollmentId);
  if (Number.isFinite(enrollmentId) && enrollmentId > 0) {
    try {
      const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
      if (enrollment) {
        startDate = parseProgramDate(enrollment.programStartDate);
        endDate = parseProgramDate(enrollment.programEndDate);
      }
    } catch (e) {
      console.warn(`Could not load enrollment ${enrollmentId} for program dates:`, e);
    }
  }

  const sessionId = Number(item.sessionId);
  if (Number.isFinite(sessionId) && sessionId > 0) {
    const session = await loadEnrollmentSessionById(sessionId);
    if (session) {
      startDate = parseProgramDate(session.startDate) ?? startDate;
      endDate = parseProgramDate(session.endDate) ?? endDate;
    }
  }

  const classId = Number(item.classId);
  if (Number.isFinite(classId) && classId > 0) {
    try {
      const classData = (await storage.getClassById(classId)) as {
        startDate?: string | Date | null;
        endDate?: string | Date | null;
        priceVariants?: unknown;
      } | null;
      if (classData) {
        let classStart = parseProgramDate(classData.startDate);
        let classEnd = parseProgramDate(classData.endDate);

        if (item.variantId && classData.priceVariants) {
          const variants =
            typeof classData.priceVariants === 'string'
              ? JSON.parse(classData.priceVariants)
              : classData.priceVariants;
          const variant = Array.isArray(variants)
            ? variants.find((v: { id?: string }) => v.id === item.variantId)
            : null;
          if (variant) {
            classStart = parseProgramDate(variant.startDate) ?? classStart;
            classEnd = parseProgramDate(variant.endDate) ?? classEnd;
          }
        }

        if (!startDate) startDate = classStart;
        if (!endDate) endDate = classEnd;
      }
    } catch (e) {
      console.warn(`Could not fetch class ${classId} for program dates:`, e);
    }
  }

  return { startDate, endDate };
}

/** Earliest start and latest end across all cart lines (multi-child / multi-session carts). */
export async function resolveCartProgramDateSpan(items: CartItem[]): Promise<ProgramDateSpan> {
  let span: ProgramDateSpan = { earliestStartDate: null, latestEndDate: null };
  for (const item of items) {
    const { startDate, endDate } = await resolveCartItemProgramDates(item);
    span = mergeSpan(span, startDate, endDate);
  }
  return span;
}
