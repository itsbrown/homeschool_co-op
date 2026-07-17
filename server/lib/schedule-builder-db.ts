/**
 * Schedule builder persistence (weekly skeletons, week plans, blocks).
 * Wired onto DatabaseStorage / CombinedStorage — Postgres only.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  weeklySkeletons,
  skeletonBlocks,
  weekPlans,
  weekPlanBlocks,
  classes,
  type WeeklySkeleton,
  type SkeletonBlock,
  type WeekPlan,
  type WeekPlanBlock,
} from "../../shared/schema";

type InsertWeeklySkeleton = typeof weeklySkeletons.$inferInsert;
type InsertSkeletonBlock = typeof skeletonBlocks.$inferInsert;
type InsertWeekPlan = typeof weekPlans.$inferInsert;
type InsertWeekPlanBlock = typeof weekPlanBlocks.$inferInsert;

export type WeekPlanBlockHistoryRow = {
  id: number;
  weekPlanBlockId: number;
  previousTitle: string | null;
  previousDescription: string | null;
  previousContent: unknown;
  previousMaterials: string[] | null;
  previousHomework: string | null;
  changedBy: number | null;
  changeReason: string | null;
  createdAt: Date;
};

async function insertBlockHistory(
  block: WeekPlanBlock,
  changedBy: number | null,
  changeReason?: string,
): Promise<void> {
  const db = await getDb();
  // postgres.js expands JS arrays into comma lists inside sql``; [] becomes a bare
  // `)` → "syntax error at or near ')'". Always emit a real text[] literal.
  const materials = Array.isArray(block.materials) ? block.materials : [];
  const materialsSql =
    materials.length > 0
      ? sql`ARRAY[${sql.join(
          materials.map((m) => sql`${m}`),
          sql`, `,
        )}]::text[]`
      : sql`ARRAY[]::text[]`;
  await db.execute(sql`
    INSERT INTO week_plan_block_history (
      week_plan_block_id, previous_title, previous_description, previous_content,
      previous_materials, previous_homework, changed_by, change_reason, created_at
    ) VALUES (
      ${block.id},
      ${block.title ?? block.customTitle ?? null},
      ${block.description ?? block.customDescription ?? null},
      ${JSON.stringify(block.content ?? {})}::jsonb,
      ${materialsSql},
      ${block.homework ?? null},
      ${changedBy},
      ${changeReason ?? null},
      NOW()
    )
  `);
}

export async function getWeeklySkeletonsBySchool(schoolId: number): Promise<WeeklySkeleton[]> {
  const db = await getDb();
  return db
    .select()
    .from(weeklySkeletons)
    .where(eq(weeklySkeletons.schoolId, schoolId))
    .orderBy(desc(weeklySkeletons.updatedAt));
}

export async function getWeeklySkeletonById(id: number): Promise<WeeklySkeleton | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(weeklySkeletons).where(eq(weeklySkeletons.id, id)).limit(1);
  return row;
}

export async function createWeeklySkeleton(
  data: InsertWeeklySkeleton & { schoolId: number; createdBy?: number },
): Promise<WeeklySkeleton> {
  const db = await getDb();
  const [row] = await db
    .insert(weeklySkeletons)
    .values({
      ...data,
      name: data.name || data.title || "Untitled template",
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function updateWeeklySkeleton(
  id: number,
  data: Partial<InsertWeeklySkeleton> & { updatedBy?: number },
): Promise<WeeklySkeleton | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(weeklySkeletons)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(weeklySkeletons.id, id))
    .returning();
  return row;
}

export async function deleteWeeklySkeleton(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(weeklySkeletons).where(eq(weeklySkeletons.id, id));
}

export async function getSkeletonBlocksBySkeletonId(skeletonId: number): Promise<SkeletonBlock[]> {
  const db = await getDb();
  return db
    .select()
    .from(skeletonBlocks)
    .where(eq(skeletonBlocks.skeletonId, skeletonId))
    .orderBy(asc(skeletonBlocks.sortOrder), asc(skeletonBlocks.startTime));
}

export async function getSkeletonBlockById(id: number): Promise<SkeletonBlock | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(skeletonBlocks).where(eq(skeletonBlocks.id, id)).limit(1);
  return row;
}

export async function createSkeletonBlock(
  data: InsertSkeletonBlock & { skeletonId: number },
): Promise<SkeletonBlock> {
  const db = await getDb();
  const [row] = await db
    .insert(skeletonBlocks)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  return row;
}

export async function updateSkeletonBlock(
  id: number,
  data: Partial<InsertSkeletonBlock> & { updatedBy?: number },
): Promise<SkeletonBlock | undefined> {
  const db = await getDb();
  const [row] = await db
    .update(skeletonBlocks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(skeletonBlocks.id, id))
    .returning();
  return row;
}

export async function deleteSkeletonBlock(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(skeletonBlocks).where(eq(skeletonBlocks.id, id));
}

export async function reorderSkeletonBlocks(skeletonId: number, blockIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < blockIds.length; i++) {
    await db
      .update(skeletonBlocks)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(and(eq(skeletonBlocks.id, blockIds[i]), eq(skeletonBlocks.skeletonId, skeletonId)));
  }
}

export async function bulkReplaceSkeletonBlocks(
  skeletonId: number,
  blocks: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    blockType: string;
    defaultTitle: string;
    subjectArea?: string | null;
    sortOrder?: number;
    defaultDescription?: string | null;
  }>,
  userId: number,
): Promise<void> {
  const db = await getDb();
  await db.delete(skeletonBlocks).where(eq(skeletonBlocks.skeletonId, skeletonId));
  if (blocks.length === 0) return;
  await db.insert(skeletonBlocks).values(
    blocks.map((b, idx) => ({
      skeletonId,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      blockType: b.blockType,
      defaultTitle: b.defaultTitle,
      subjectArea: b.subjectArea ?? null,
      defaultDescription: b.defaultDescription ?? null,
      sortOrder: b.sortOrder ?? idx,
      createdBy: userId,
      updatedBy: userId,
    })),
  );
}

export async function getWeekPlansBySkeletonId(skeletonId: number): Promise<WeekPlan[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlans)
    .where(eq(weekPlans.skeletonId, skeletonId))
    .orderBy(asc(weekPlans.weekNumber));
}

export async function getPublishedWeekPlansBySchool(schoolId: number): Promise<WeekPlan[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlans)
    .where(and(eq(weekPlans.schoolId, schoolId), eq(weekPlans.status, "published")))
    .orderBy(desc(weekPlans.weekStartDate), asc(weekPlans.weekNumber));
}

export async function getWeekPlanById(id: number): Promise<WeekPlan | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(weekPlans).where(eq(weekPlans.id, id)).limit(1);
  return row;
}

export async function createWeekPlan(
  data: InsertWeekPlan & { schoolId: number; skeletonId: number },
): Promise<WeekPlan> {
  const db = await getDb();
  const [row] = await db
    .insert(weekPlans)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  return row;
}

export async function updateWeekPlan(
  id: number,
  data: Partial<InsertWeekPlan> & { updatedBy?: number; publishedAt?: Date | null },
): Promise<WeekPlan | undefined> {
  const db = await getDb();
  const patch: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.status === "published" && data.publishedAt === undefined) {
    patch.publishedAt = new Date();
  }
  const [row] = await db.update(weekPlans).set(patch).where(eq(weekPlans.id, id)).returning();
  return row;
}

export async function deleteWeekPlan(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(weekPlans).where(eq(weekPlans.id, id));
}

export async function cloneWeekPlan(
  sourceId: number,
  weekNumber: number,
  weekStartDate: string,
  userId: number,
): Promise<WeekPlan> {
  const db = await getDb();
  const source = await getWeekPlanById(sourceId);
  if (!source) throw new Error("Source week plan not found");
  const sourceBlocks = await getWeekPlanBlocksByWeekPlanId(sourceId);

  const [cloned] = await db
    .insert(weekPlans)
    .values({
      skeletonId: source.skeletonId,
      schoolId: source.schoolId,
      sessionId: source.sessionId,
      weekNumber,
      weekStartDate,
      theme: source.theme,
      notes: source.notes,
      status: "draft",
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  if (sourceBlocks.length > 0) {
    await db.insert(weekPlanBlocks).values(
      sourceBlocks.map((b) => ({
        weekPlanId: cloned.id,
        skeletonBlockId: b.skeletonBlockId,
        title: b.title,
        description: b.description,
        customTitle: b.customTitle,
        customDescription: b.customDescription,
        content: b.content,
        materials: b.materials,
        homework: b.homework,
        aiGenerated: b.aiGenerated,
        resources: b.resources,
        lessonLink: b.lessonLink,
        attachments: b.attachments,
        objectives: b.objectives,
        groups: b.groups,
        notes: b.notes,
        isCompleted: false,
        updatedBy: userId,
      })),
    );
  }
  return cloned;
}

export async function getWeekPlanBlocksByWeekPlanId(weekPlanId: number): Promise<WeekPlanBlock[]> {
  const db = await getDb();
  return db.select().from(weekPlanBlocks).where(eq(weekPlanBlocks.weekPlanId, weekPlanId));
}

export async function getWeekPlanBlockById(id: number): Promise<WeekPlanBlock | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(weekPlanBlocks).where(eq(weekPlanBlocks.id, id)).limit(1);
  return row;
}

export async function createWeekPlanBlock(
  data: InsertWeekPlanBlock & { weekPlanId: number; skeletonBlockId: number },
): Promise<WeekPlanBlock> {
  const db = await getDb();
  const [row] = await db
    .insert(weekPlanBlocks)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  return row;
}

export async function updateWeekPlanBlock(
  id: number,
  data: Partial<InsertWeekPlanBlock>,
  userId?: number,
): Promise<WeekPlanBlock | undefined> {
  const existing = await getWeekPlanBlockById(id);
  if (!existing) return undefined;
  if (userId != null) {
    await insertBlockHistory(existing, userId, "update");
  }
  const db = await getDb();
  const [row] = await db
    .update(weekPlanBlocks)
    .set({ ...data, updatedBy: userId ?? data.updatedBy, updatedAt: new Date() })
    .where(eq(weekPlanBlocks.id, id))
    .returning();
  return row;
}

export async function deleteWeekPlanBlock(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(weekPlanBlocks).where(eq(weekPlanBlocks.id, id));
}

export async function markBlockCompleted(id: number, userId: number): Promise<WeekPlanBlock | undefined> {
  const existing = await getWeekPlanBlockById(id);
  if (!existing) return undefined;
  await insertBlockHistory(existing, userId, "complete");
  const db = await getDb();
  const nextCompleted = !existing.isCompleted;
  const [row] = await db
    .update(weekPlanBlocks)
    .set({
      isCompleted: nextCompleted,
      completedBy: nextCompleted ? userId : null,
      completedAt: nextCompleted ? new Date() : null,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(weekPlanBlocks.id, id))
    .returning();
  return row;
}

export async function getBlockHistory(blockId: number): Promise<WeekPlanBlockHistoryRow[]> {
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT
      id,
      week_plan_block_id AS "weekPlanBlockId",
      previous_title AS "previousTitle",
      previous_description AS "previousDescription",
      previous_content AS "previousContent",
      previous_materials AS "previousMaterials",
      previous_homework AS "previousHomework",
      changed_by AS "changedBy",
      change_reason AS "changeReason",
      created_at AS "createdAt"
    FROM week_plan_block_history
    WHERE week_plan_block_id = ${blockId}
    ORDER BY created_at DESC
  `);
  return (result.rows as WeekPlanBlockHistoryRow[]) || [];
}

export async function bulkUpdateWeekPlanBlocks(
  weekPlanId: number,
  updates: Array<{
    skeletonBlockId: number;
    title?: string | null;
    description?: string | null;
    objectives?: string[] | null;
    lessonLink?: string | null;
    notes?: string | null;
  }>,
  userId: number,
): Promise<void> {
  const existing = await getWeekPlanBlocksByWeekPlanId(weekPlanId);
  const bySkel = new Map(existing.map((b) => [b.skeletonBlockId, b]));

  for (const u of updates) {
    const current = bySkel.get(u.skeletonBlockId);
    if (current) {
      await updateWeekPlanBlock(
        current.id,
        {
          title: u.title ?? current.title,
          description: u.description ?? current.description,
          objectives: u.objectives ?? (current.objectives as string[]),
          lessonLink: u.lessonLink ?? current.lessonLink,
          notes: u.notes ?? current.notes,
        },
        userId,
      );
    } else {
      await createWeekPlanBlock({
        weekPlanId,
        skeletonBlockId: u.skeletonBlockId,
        title: u.title ?? null,
        description: u.description ?? null,
        objectives: u.objectives ?? [],
        lessonLink: u.lessonLink ?? null,
        notes: u.notes ?? null,
        updatedBy: userId,
      });
    }
  }
}

/** Published week plans for given marketplace class IDs and optional week start date. */
export async function getPublishedWeekPlansForClassIds(
  schoolId: number,
  classIds: number[],
  weekStartDate?: string,
): Promise<Array<WeekPlan & { classId: number | null; classTitle: string | null; skeletonName: string }>> {
  if (classIds.length === 0) return [];
  const db = await getDb();
  const conditions = [
    eq(weekPlans.schoolId, schoolId),
    eq(weekPlans.status, "published"),
    inArray(weeklySkeletons.classId, classIds),
  ];
  if (weekStartDate) {
    conditions.push(eq(weekPlans.weekStartDate, weekStartDate));
  }
  const rows = await db
    .select({
      plan: weekPlans,
      classId: weeklySkeletons.classId,
      classTitle: classes.title,
      skeletonName: weeklySkeletons.name,
    })
    .from(weekPlans)
    .innerJoin(weeklySkeletons, eq(weekPlans.skeletonId, weeklySkeletons.id))
    .leftJoin(classes, eq(weeklySkeletons.classId, classes.id))
    .where(and(...conditions))
    .orderBy(asc(weekPlans.weekNumber));

  return rows.map((r: {
    plan: WeekPlan;
    classId: number | null;
    classTitle: string | null;
    skeletonName: string | null;
  }) => ({
    ...r.plan,
    classId: r.classId,
    classTitle: r.classTitle,
    skeletonName: r.skeletonName || "",
  }));
}

export async function getAcademicsLessonKpi(params: {
  schoolId: number;
  startDate?: string;
  endDate?: string;
  classId?: number;
}): Promise<{
  plansPublished: number;
  totalBlocks: number;
  completedBlocks: number;
  completionPercent: number;
  byClass: Array<{
    classId: number | null;
    classTitle: string;
    weekNumber: number;
    weekStartDate: string | null;
    totalBlocks: number;
    completedBlocks: number;
    completionPercent: number;
  }>;
  incomplete: Array<{
    blockId: number;
    title: string;
    classTitle: string;
    weekNumber: number;
    weekStartDate: string | null;
  }>;
}> {
  const db = await getDb();
  const planConditions = [eq(weekPlans.schoolId, params.schoolId), eq(weekPlans.status, "published")];
  if (params.startDate) {
    planConditions.push(gte(weekPlans.weekStartDate, params.startDate));
  }
  if (params.endDate) {
    planConditions.push(lte(weekPlans.weekStartDate, params.endDate));
  }
  if (params.classId != null) {
    planConditions.push(eq(weeklySkeletons.classId, params.classId));
  }

  const plans = await db
    .select({
      plan: weekPlans,
      classId: weeklySkeletons.classId,
      classTitle: classes.title,
      skeletonName: weeklySkeletons.name,
    })
    .from(weekPlans)
    .innerJoin(weeklySkeletons, eq(weekPlans.skeletonId, weeklySkeletons.id))
    .leftJoin(classes, eq(weeklySkeletons.classId, classes.id))
    .where(and(...planConditions));

  if (plans.length === 0) {
    return {
      plansPublished: 0,
      totalBlocks: 0,
      completedBlocks: 0,
      completionPercent: 0,
      byClass: [],
      incomplete: [],
    };
  }

  const planIds = plans.map((p) => p.plan.id);
  const blocks = await db
    .select()
    .from(weekPlanBlocks)
    .where(inArray(weekPlanBlocks.weekPlanId, planIds));

  const blocksByPlan = new Map<number, WeekPlanBlock[]>();
  for (const b of blocks) {
    const list = blocksByPlan.get(b.weekPlanId) || [];
    list.push(b);
    blocksByPlan.set(b.weekPlanId, list);
  }

  let totalBlocks = 0;
  let completedBlocks = 0;
  const byClass: Array<{
    classId: number | null;
    classTitle: string;
    weekNumber: number;
    weekStartDate: string | null;
    totalBlocks: number;
    completedBlocks: number;
    completionPercent: number;
  }> = [];
  const incomplete: Array<{
    blockId: number;
    title: string;
    classTitle: string;
    weekNumber: number;
    weekStartDate: string | null;
  }> = [];

  for (const p of plans as Array<{
    plan: WeekPlan;
    classId: number | null;
    classTitle: string | null;
    skeletonName: string | null;
  }>) {
    const planBlocks = blocksByPlan.get(p.plan.id) || [];
    const completed = planBlocks.filter((b) => b.isCompleted).length;
    totalBlocks += planBlocks.length;
    completedBlocks += completed;
    const classTitle = p.classTitle || p.skeletonName || "Unlinked class";
    byClass.push({
      classId: p.classId,
      classTitle,
      weekNumber: p.plan.weekNumber,
      weekStartDate: p.plan.weekStartDate,
      totalBlocks: planBlocks.length,
      completedBlocks: completed,
      completionPercent:
        planBlocks.length > 0 ? Math.round((completed / planBlocks.length) * 10000) / 100 : 0,
    });
    for (const b of planBlocks) {
      if (!b.isCompleted) {
        incomplete.push({
          blockId: b.id,
          title: b.title || b.customTitle || "Untitled block",
          classTitle,
          weekNumber: p.plan.weekNumber,
          weekStartDate: p.plan.weekStartDate,
        });
      }
    }
  }

  return {
    plansPublished: plans.length,
    totalBlocks,
    completedBlocks,
    completionPercent:
      totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 10000) / 100 : 0,
    byClass,
    incomplete,
  };
}
