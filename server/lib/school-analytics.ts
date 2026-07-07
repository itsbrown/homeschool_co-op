/**
 * Persist and query school analytics events (activity + checkout funnel).
 */
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  userActivityEvents,
  checkoutFunnelEvents,
  children,
  users,
  locations,
  programEnrollments,
  schoolClasses,
  storeOrders,
  type InsertUserActivityEvent,
  type InsertCheckoutFunnelEvent,
} from "../../shared/schema";

export async function insertUserActivityEvents(rows: InsertUserActivityEvent[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  await db.insert(userActivityEvents).values(rows);
}

export async function insertCheckoutFunnelEvent(row: InsertCheckoutFunnelEvent): Promise<void> {
  const db = await getDb();
  await db.insert(checkoutFunnelEvents).values(row);
}

export async function insertCheckoutFunnelEvents(rows: InsertCheckoutFunnelEvent[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  await db.insert(checkoutFunnelEvents).values(rows);
}

const ABANDON_STALE_MS = 24 * 60 * 60 * 1000;
const ABANDON_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

/** Emit `abandon` for checkout attempts idle 24h+ with no purchase (idempotent per correlation). */
export async function emitStaleCheckoutAbandonEvents(): Promise<{ emitted: number }> {
  const db = await getDb();
  const staleBefore = new Date(Date.now() - ABANDON_STALE_MS);
  const since = new Date(Date.now() - ABANDON_LOOKBACK_MS);

  const events = await db
    .select()
    .from(checkoutFunnelEvents)
    .where(gte(checkoutFunnelEvents.createdAt, since))
    .orderBy(desc(checkoutFunnelEvents.createdAt));

  const byCorrelation = new Map<string, typeof events>();
  for (const e of events) {
    const list = byCorrelation.get(e.correlationId) || [];
    list.push(e);
    byCorrelation.set(e.correlationId, list);
  }

  const rows: InsertCheckoutFunnelEvent[] = [];
  for (const [correlationId, evts] of byCorrelation) {
    if (evts.some((e) => e.step === "purchase" || e.step === "abandon")) continue;

    const latest = evts.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    if (latest.createdAt > staleBefore) continue;

    rows.push({
      schoolId: latest.schoolId,
      correlationId,
      parentId: latest.parentId,
      parentEmail: latest.parentEmail,
      lane: latest.lane,
      step: "abandon",
      enrollmentIds: (latest.enrollmentIds as number[]) || [],
      storeOrderId: latest.storeOrderId,
      classIds: (latest.classIds as number[]) || [],
      childIds: (latest.childIds as number[]) || [],
      cartValueCents: latest.cartValueCents,
      metadata: {
        ...((latest.metadata as Record<string, unknown>) || {}),
        autoAbandon: true,
        lastStep: latest.step,
      },
    });
  }

  if (rows.length) await insertCheckoutFunnelEvents(rows);
  return { emitted: rows.length };
}

/** Record a `purchase` funnel step, reusing correlation from prior events when possible. */
export async function recordCheckoutFunnelPurchase(params: {
  schoolId: number;
  lane: "member_cart" | "public_store";
  correlationId?: string;
  storeOrderId?: number | null;
  parentId?: number | null;
  parentEmail?: string | null;
  enrollmentIds?: number[];
  classIds?: number[];
  childIds?: number[];
  cartValueCents?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  let correlationId = params.correlationId;

  if (!correlationId && params.storeOrderId) {
    const [prior] = await db
      .select()
      .from(checkoutFunnelEvents)
      .where(eq(checkoutFunnelEvents.storeOrderId, params.storeOrderId))
      .orderBy(desc(checkoutFunnelEvents.createdAt))
      .limit(1);
    correlationId = prior?.correlationId;
  }

  if (!correlationId && params.storeOrderId) {
    correlationId = `public-store-${params.storeOrderId}`;
  }

  if (!correlationId) return;

  const [existingPurchase] = await db
    .select({ id: checkoutFunnelEvents.id })
    .from(checkoutFunnelEvents)
    .where(
      and(
        eq(checkoutFunnelEvents.correlationId, correlationId),
        eq(checkoutFunnelEvents.step, "purchase"),
      ),
    )
    .limit(1);
  if (existingPurchase) return;

  const [latest] = await db
    .select()
    .from(checkoutFunnelEvents)
    .where(eq(checkoutFunnelEvents.correlationId, correlationId))
    .orderBy(desc(checkoutFunnelEvents.createdAt))
    .limit(1);

  await insertCheckoutFunnelEvent({
    schoolId: params.schoolId,
    correlationId,
    parentId: params.parentId ?? latest?.parentId ?? undefined,
    parentEmail: params.parentEmail ?? latest?.parentEmail ?? undefined,
    lane: params.lane,
    step: "purchase",
    enrollmentIds: params.enrollmentIds ?? (latest?.enrollmentIds as number[]) ?? [],
    storeOrderId: params.storeOrderId ?? latest?.storeOrderId ?? undefined,
    classIds: params.classIds ?? (latest?.classIds as number[]) ?? [],
    childIds: params.childIds ?? (latest?.childIds as number[]) ?? [],
    cartValueCents: params.cartValueCents ?? latest?.cartValueCents ?? 0,
    metadata: params.metadata ?? (latest?.metadata as Record<string, unknown>) ?? {},
  });
}

export type AnalyticsFilters = {
  from?: Date;
  to?: Date;
  locationId?: number;
  grade?: string;
  gender?: string;
  ageBand?: string;
  teacherId?: number;
};

const FUNNEL_STEPS = [
  "add_to_cart",
  "view_cart",
  "begin_checkout",
  "add_payment_info",
  "purchase",
  "abandon",
] as const;

function ageBandFromBirthdate(birthdate: string | Date | null): string {
  if (!birthdate) return "unknown";
  const bd = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  if (age <= 5) return "prek_k";
  if (age <= 8) return "grades_1_3";
  if (age <= 13) return "grades_4_8";
  if (age <= 18) return "grades_9_12";
  return "adult";
}

function matchesDemographics(
  child: { gradeLevel: string; gender: string | null; birthdate: string | Date | null; locationId: number | null },
  filters: AnalyticsFilters,
): boolean {
  if (filters.locationId && child.locationId !== filters.locationId) return false;
  if (filters.grade && child.gradeLevel !== filters.grade) return false;
  if (filters.gender) {
    const g = child.gender || "unknown";
    if (filters.gender !== g) return false;
  }
  if (filters.ageBand && ageBandFromBirthdate(child.birthdate) !== filters.ageBand) return false;
  return true;
}

export async function buildEngagementAnalytics(schoolId: number, filters: AnalyticsFilters = {}) {
  const db = await getDb();
  const from = filters.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = filters.to || new Date();

  const events = await db
    .select()
    .from(userActivityEvents)
    .where(
      and(
        eq(userActivityEvents.schoolId, schoolId),
        gte(userActivityEvents.createdAt, from),
        lte(userActivityEvents.createdAt, to),
      ),
    )
    .orderBy(desc(userActivityEvents.createdAt));

  const parentUsers = await db
    .select()
    .from(users)
    .where(eq(users.schoolId, schoolId));

  const childRows = await db.select().from(children).where(eq(children.schoolId, schoolId));
  const locationRows = await db.select().from(locations).where(eq(locations.schoolId, schoolId));
  const locationMap = new Map(locationRows.map((l) => [l.id, l.name]));

  const loginEvents = events.filter((e) => e.eventType === "login");
  const pageViews = events.filter((e) => e.eventType === "page_view");
  const sessionEnds = events.filter((e) => e.eventType === "session_end" && e.durationMs);

  const uniqueUsers = new Set(events.map((e) => e.userId).filter(Boolean));
  const uniqueLogins = new Set(loginEvents.map((e) => e.userId).filter(Boolean));

  const totalDuration = sessionEnds.reduce((s, e) => s + (e.durationMs || 0), 0);
  const avgSessionMs =
    sessionEnds.length > 0 ? Math.round(totalDuration / sessionEnds.length) : 0;

  const dayMap = new Map<string, Set<number>>();
  for (const e of loginEvents) {
    if (!e.userId) continue;
    const day = e.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, new Set());
    dayMap.get(day)!.add(e.userId);
  }
  const dailyTrend = Array.from(dayMap.entries())
    .map(([date, set]) => ({ date, activeParents: set.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  type DimKey = string;
  const dimCounts = new Map<DimKey, Set<number>>();

  function addDim(dim: string, userId: number) {
    if (!dimCounts.has(dim)) dimCounts.set(dim, new Set());
    dimCounts.get(dim)!.add(userId);
  }

  for (const uid of uniqueLogins) {
    const user = parentUsers.find((u) => u.id === uid);
    if (!user) continue;
    const userChildren = childRows.filter((c) => c.parentId === uid);
    const enrolled = userChildren.filter((c) => matchesDemographics(c, filters));
    if (filters.locationId || filters.grade || filters.gender || filters.ageBand) {
      if (!enrolled.length) continue;
    }
    const primary = enrolled[0] || userChildren[0];
    if (primary) {
      addDim(`location:${primary.locationId ?? 0}`, uid);
      addDim(`grade:${primary.gradeLevel}`, uid);
      addDim(`gender:${primary.gender || "unknown"}`, uid);
      addDim(`age:${ageBandFromBirthdate(primary.birthdate)}`, uid);
    } else {
      addDim(`location:${user.locationId ?? 0}`, uid);
    }
  }

  const breakdownByLocation = Array.from(dimCounts.entries())
    .filter(([k]) => k.startsWith("location:"))
    .map(([k, set]) => ({
      key: locationMap.get(parseInt(k.split(":")[1], 10)) || "Unassigned",
      count: set.size,
    }));

  const breakdownByGrade = Array.from(dimCounts.entries())
    .filter(([k]) => k.startsWith("grade:"))
    .map(([k, set]) => ({ key: k.split(":")[1], count: set.size }));

  const breakdownByGender = Array.from(dimCounts.entries())
    .filter(([k]) => k.startsWith("gender:"))
    .map(([k, set]) => ({ key: k.split(":")[1], count: set.size }));

  const breakdownByAge = Array.from(dimCounts.entries())
    .filter(([k]) => k.startsWith("age:"))
    .map(([k, set]) => ({ key: k.split(":")[1], count: set.size }));

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentLoginUsers = new Set(
    loginEvents.filter((e) => e.createdAt >= fourteenDaysAgo).map((e) => e.userId),
  );

  const atRisk: { parentEmail: string; parentName: string; lastLogin: string | null; reason: string }[] = [];
  for (const u of parentUsers) {
    if (u.role !== "parent") continue;
    const hasEnrollment = await db
      .select({ id: programEnrollments.id })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          eq(programEnrollments.parentId, u.id),
          inArray(programEnrollments.status, ["enrolled", "pending_payment"]),
        ),
      )
      .limit(1);
    if (!hasEnrollment.length) continue;
    if (!recentLoginUsers.has(u.id)) {
      atRisk.push({
        parentEmail: u.email,
        parentName: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        lastLogin: u.lastLogin ? String(u.lastLogin) : null,
        reason: "No login in 14 days with active enrollment",
      });
    }
  }

  return {
    summary: {
      dau: dailyTrend.length ? dailyTrend[dailyTrend.length - 1].activeParents : 0,
      wau: uniqueLogins.size,
      mau: uniqueLogins.size,
      avgSessionMinutes: Math.round(avgSessionMs / 60000),
      totalPageViews: pageViews.length,
      activeParents: uniqueLogins.size,
    },
    dailyTrend,
    breakdownByLocation,
    breakdownByGrade,
    breakdownByGender,
    breakdownByAge,
    atRisk,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildCartAbandonmentAnalytics(schoolId: number, filters: AnalyticsFilters = {}) {
  const db = await getDb();
  const from = filters.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = filters.to || new Date();

  let funnelEvents = await db
    .select()
    .from(checkoutFunnelEvents)
    .where(
      and(
        eq(checkoutFunnelEvents.schoolId, schoolId),
        gte(checkoutFunnelEvents.createdAt, from),
        lte(checkoutFunnelEvents.createdAt, to),
      ),
    )
    .orderBy(desc(checkoutFunnelEvents.createdAt));

  if (funnelEvents.length === 0) {
    await backfillCartFunnelFromLegacy(schoolId, from, to);
    funnelEvents = await db
      .select()
      .from(checkoutFunnelEvents)
      .where(
        and(
          eq(checkoutFunnelEvents.schoolId, schoolId),
          gte(checkoutFunnelEvents.createdAt, from),
          lte(checkoutFunnelEvents.createdAt, to),
        ),
      )
      .orderBy(desc(checkoutFunnelEvents.createdAt));
  }

  const stepCounts = new Map<string, number>();
  for (const step of FUNNEL_STEPS) stepCounts.set(step, 0);
  for (const e of funnelEvents) {
    stepCounts.set(e.step, (stepCounts.get(e.step) || 0) + 1);
  }

  const funnel = FUNNEL_STEPS.map((step, i) => {
    const count = stepCounts.get(step) || 0;
    const prev = i > 0 ? stepCounts.get(FUNNEL_STEPS[i - 1]) || 0 : count;
    const conversionPct = prev > 0 ? Math.round((count / prev) * 100) : 0;
    return { step, count, conversionPct };
  });

  const childRows = await db.select().from(children).where(eq(children.schoolId, schoolId));
  const classRows = await db.select().from(schoolClasses).where(eq(schoolClasses.schoolId, schoolId));
  const locationRows = await db.select().from(locations).where(eq(locations.schoolId, schoolId));
  const locMap = new Map(locationRows.map((l) => [l.id, l.name]));

  const byCorrelation = new Map<string, typeof funnelEvents>();
  for (const e of funnelEvents) {
    const list = byCorrelation.get(e.correlationId) || [];
    list.push(e);
    byCorrelation.set(e.correlationId, list);
  }

  const abandoned: {
    parentEmail: string;
    parentName: string;
    children: { name: string; gradeLevel: string; gender: string | null; age: number | null }[];
    classes: { name: string; instructorName: string | null; locationName: string | null }[];
    cartValueCents: number;
    lastStep: string;
    lastActivityAt: string;
    lane: string;
    correlationId: string;
  }[] = [];

  for (const [corrId, evts] of byCorrelation) {
    const sorted = [...evts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = sorted[0];
    if (latest.step === "purchase") continue;

    const childIds = (latest.childIds as number[]) || [];
    const classIds = (latest.classIds as number[]) || [];
    const matchedChildren = childRows.filter((c) => childIds.includes(c.id));
    if (filters.grade || filters.gender || filters.ageBand || filters.locationId) {
      const anyMatch = matchedChildren.some((c) => matchesDemographics(c, filters));
      if (matchedChildren.length && !anyMatch) continue;
    }

    const matchedClasses = classRows.filter((c) => classIds.includes(c.id));
    if (filters.teacherId) {
      if (!matchedClasses.some((c) => c.teacherId === filters.teacherId)) continue;
    }

    abandoned.push({
      parentEmail: latest.parentEmail || "",
      parentName: (latest.metadata as any)?.parentName || "",
      children: matchedChildren.map((c) => ({
        name: `${c.firstName} ${c.lastName}`,
        gradeLevel: c.gradeLevel,
        gender: c.gender,
        age: c.birthdate
          ? new Date().getFullYear() - new Date(c.birthdate).getFullYear()
          : null,
      })),
      classes: matchedClasses.map((c) => ({
        name: c.title,
        instructorName: null,
        locationName: c.locationId ? locMap.get(c.locationId) || null : null,
      })),
      cartValueCents: latest.cartValueCents,
      lastStep: latest.step,
      lastActivityAt: latest.createdAt.toISOString(),
      lane: latest.lane,
      correlationId: corrId,
    });
  }

  const totalAbandoned = abandoned.length;
  const totalValueCents = abandoned.reduce((s, a) => s + a.cartValueCents, 0);
  const began = stepCounts.get("begin_checkout") || stepCounts.get("add_to_cart") || 0;
  const purchased = stepCounts.get("purchase") || 0;
  const abandonmentRate = began > 0 ? Math.round(((began - purchased) / began) * 100) : 0;

  return {
    funnel,
    abandoned,
    summary: { totalAbandoned, totalValueCents, abandonmentRate },
    generatedAt: new Date().toISOString(),
  };
}

async function backfillCartFunnelFromLegacy(schoolId: number, from: Date, to: Date) {
  const db = await getDb();
  const pending = await db
    .select()
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, schoolId),
        eq(programEnrollments.status, "pending_payment"),
        gte(programEnrollments.enrollmentDate, from),
        lte(programEnrollments.enrollmentDate, to),
      ),
    );

  const rows: InsertCheckoutFunnelEvent[] = [];
  for (const e of pending) {
    const corr = `legacy-pe-${e.id}`;
    rows.push({
      schoolId,
      correlationId: corr,
      parentId: e.parentId,
      parentEmail: e.parentEmail,
      lane: "member_cart",
      step: "abandon",
      enrollmentIds: [e.id],
      classIds: e.classId ? [e.classId] : [],
      childIds: [e.childId],
      cartValueCents: e.totalCost || 0,
      metadata: { parentName: e.parentEmail, backfill: true },
    });
  }

  const storePending = await db
    .select()
    .from(storeOrders)
    .where(
      and(
        eq(storeOrders.schoolId, schoolId),
        eq(storeOrders.status, "pending"),
        gte(storeOrders.createdAt, from),
        lte(storeOrders.createdAt, to),
      ),
    );

  for (const o of storePending) {
    rows.push({
      schoolId,
      correlationId: `legacy-store-${o.id}`,
      parentId: o.parentId,
      parentEmail: o.parentEmail,
      lane: "public_store",
      step: "abandon",
      storeOrderId: o.id,
      cartValueCents: o.totalCents,
      metadata: { parentName: o.parentName, backfill: true },
    });
  }

  if (rows.length) await insertCheckoutFunnelEvents(rows);
}
