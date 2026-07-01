import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { sessions, classes, type StoreListing } from '@shared/schema';
import { storage } from '../storage';
import {
  getStoreListingBySource,
  getStoreListingsBySchoolId,
  upsertStoreListing,
} from './store-storage';

export type StoreProgramDto = {
  listingType: 'session' | 'class';
  sourceId: number;
  title: string;
  description: string | null;
  category: string | null;
  startDate: string | null;
  endDate: string | null;
  priceCents: number | null;
  halfDayPrice: number | null;
  fullDayPrice: number | null;
  coverImage: string | null;
  readyForStore: boolean;
  readyHint: string | null;
  editPath: string;
  storeListing: {
    listingId: number | null;
    isPublished: boolean;
    membersOnly: boolean;
  };
};

function listingState(
  listings: StoreListing[],
  listingType: 'session' | 'class',
  sourceId: number,
) {
  const row = listings.find((l) => l.listingType === listingType && l.sourceId === sourceId);
  return {
    listingId: row?.id ?? null,
    isPublished: row?.isPublished ?? false,
    membersOnly: row?.membersOnly ?? false,
  };
}

function sessionReady(row: typeof sessions.$inferSelect): { ready: boolean; hint: string | null } {
  if (!row.enrollmentOpen) {
    return { ready: false, hint: 'Turn on enrollment open in Sessions' };
  }
  if (row.halfDayPrice == null && row.fullDayPrice == null) {
    return { ready: false, hint: 'Add half-day or full-day pricing in Sessions' };
  }
  return { ready: true, hint: null };
}

/** Same visibility rules as parent catalog + store admin readiness. */
export function isClassEligibleForPublicStore(cls: {
  enrollmentOpen?: boolean | null;
  isAdminOnly?: boolean | null;
  price?: number | null;
  endDate?: string | Date | null;
}): boolean {
  if (!cls.enrollmentOpen || cls.isAdminOnly) return false;
  if (!cls.price || cls.price <= 0) return false;
  if (cls.endDate && new Date(cls.endDate) < new Date()) return false;
  return true;
}

function classReady(row: typeof classes.$inferSelect): { ready: boolean; hint: string | null } {
  if (!row.enrollmentOpen) {
    return { ready: false, hint: 'Turn on Open for Enrollment in Classes' };
  }
  if (!row.price || row.price <= 0) {
    return { ready: false, hint: 'Set a price on the class' };
  }
  return { ready: true, hint: null };
}

export async function getStoreProgramsForSchool(schoolId: number): Promise<StoreProgramDto[]> {
  const db = await getDb();
  const [sessionRows, classRows, listings] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.schoolId, schoolId))
      .orderBy(desc(sessions.sortOrder), desc(sessions.startDate)),
    storage.getClassesBySchoolId(String(schoolId)),
    getStoreListingsBySchoolId(schoolId),
  ]);

  const programs: StoreProgramDto[] = [];

  for (const row of sessionRows) {
    const { ready, hint } = sessionReady(row);
    programs.push({
      listingType: 'session',
      sourceId: row.id,
      title: row.name,
      description: row.description,
      category: null,
      startDate: row.startDate,
      endDate: row.endDate,
      priceCents: null,
      halfDayPrice: row.halfDayPrice,
      fullDayPrice: row.fullDayPrice,
      coverImage: row.coverImage ?? null,
      readyForStore: ready,
      readyHint: hint,
      editPath: '/schools/sessions',
      storeListing: listingState(listings, 'session', row.id),
    });
  }

  for (const row of classRows) {
    if (row.isAdminOnly) continue;
    const { ready, hint } = classReady(row as typeof classes.$inferSelect);
    programs.push({
      listingType: 'class',
      sourceId: row.id,
      title: row.title,
      description: row.description,
      category: row.category ?? null,
      startDate: row.startDate ? String(row.startDate) : null,
      endDate: row.endDate ? String(row.endDate) : null,
      priceCents: row.price ?? null,
      halfDayPrice: null,
      fullDayPrice: null,
      coverImage: row.coverImage ?? null,
      readyForStore: ready,
      readyHint: hint,
      editPath: `/schools/classes/${row.id}/edit`,
      storeListing: listingState(listings, 'class', row.id),
    });
  }

  return programs;
}

export async function patchStoreProgram(params: {
  schoolId: number;
  listingType: 'session' | 'class';
  sourceId: number;
  isPublished?: boolean;
  membersOnly?: boolean;
  coverImage?: string | null;
}): Promise<StoreProgramDto> {
  const db = await getDb();

  if (params.listingType === 'session') {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, params.sourceId))
      .limit(1);
    if (!session || session.schoolId !== params.schoolId) {
      throw new Error('Session not found');
    }
    if (params.coverImage !== undefined) {
      await db
        .update(sessions)
        .set({ coverImage: params.coverImage, updatedAt: new Date() })
        .where(eq(sessions.id, params.sourceId));
    }
  } else {
    const cls = await storage.getClassById(params.sourceId);
    if (!cls || cls.schoolId !== params.schoolId) {
      throw new Error('Class not found');
    }
    if (params.coverImage !== undefined) {
      await storage.updateClass(params.sourceId, { coverImage: params.coverImage });
    }
  }

  if (params.isPublished !== undefined || params.membersOnly !== undefined) {
    const existing = await getStoreListingBySource(
      params.schoolId,
      params.listingType,
      params.sourceId,
    );
    await upsertStoreListing({
      schoolId: params.schoolId,
      listingType: params.listingType,
      sourceId: params.sourceId,
      isPublished: params.isPublished ?? existing?.isPublished ?? false,
      membersOnly: params.membersOnly ?? existing?.membersOnly ?? false,
    });
  }

  const programs = await getStoreProgramsForSchool(params.schoolId);
  const updated = programs.find(
    (p) => p.listingType === params.listingType && p.sourceId === params.sourceId,
  );
  if (!updated) throw new Error('Program not found after update');
  return updated;
}
