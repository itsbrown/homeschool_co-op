import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "@shared/schema";
import {
  PAYROLL_CHECKLIST_EMAIL,
  PAYROLL_ROSTER,
  hoursToMinutes,
  type PayrollPresent,
} from "@shared/payroll-day";
import { ensurePayrollDaySchema } from "./ensure-payroll-day-schema";

export type PayrollJobRow = {
  id: number;
  schoolId: number;
  jobKey: string;
  personName: string;
  jobLabel: string;
  rateCents: number;
  weeklyMinutes: number;
  credit: boolean;
  sortOrder: number;
  active: boolean;
};

export type PayrollLineRow = {
  jobId: number;
  personName: string;
  jobLabel: string;
  present: PayrollPresent;
  differentMinutes: number | null;
  note: string | null;
  rateCentsSnapshot: number;
  weeklyMinutesSnapshot: number;
  sortOrder: number;
};

async function db() {
  await ensurePayrollDaySchema();
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  return database;
}

export async function seedPayrollRoster(schoolId: number): Promise<void> {
  const database = await db();
  for (const job of PAYROLL_ROSTER) {
    await database.execute(sql`
      INSERT INTO payroll_jobs (
        school_id, job_key, person_name, job_label, rate_cents, weekly_minutes, credit, sort_order
      ) VALUES (
        ${schoolId}, ${job.key}, ${job.personName}, ${job.jobLabel},
        ${job.rateDollars * 100}, ${hoursToMinutes(job.weeklyHours)}, ${job.credit}, ${job.sortOrder}
      )
      ON CONFLICT (school_id, job_key) DO NOTHING
    `);
  }
}

export async function listActiveJobs(schoolId: number): Promise<PayrollJobRow[]> {
  const database = await db();
  const rows = await database.execute(sql`
    SELECT id, school_id, job_key, person_name, job_label, rate_cents, weekly_minutes, credit, sort_order, active
    FROM payroll_jobs
    WHERE school_id = ${schoolId} AND active = TRUE
    ORDER BY sort_order, id
  `);
  return (rows as unknown as Record<string, unknown>[]).map(mapJob);
}

function mapJob(row: Record<string, unknown>): PayrollJobRow {
  return {
    id: Number(row.id),
    schoolId: Number(row.school_id),
    jobKey: String(row.job_key),
    personName: String(row.person_name),
    jobLabel: String(row.job_label),
    rateCents: Number(row.rate_cents),
    weeklyMinutes: Number(row.weekly_minutes),
    credit: Boolean(row.credit),
    sortOrder: Number(row.sort_order),
    active: Boolean(row.active),
  };
}

export async function userCanFillChecklist(schoolId: number, userId: number, email: string | null): Promise<boolean> {
  if ((email ?? "").trim().toLowerCase() === PAYROLL_CHECKLIST_EMAIL) return true;
  const database = await db();
  const rows = await database.execute(sql`
    SELECT 1 FROM payroll_checklist_access
    WHERE school_id = ${schoolId} AND user_id = ${userId}
    LIMIT 1
  `);
  return (rows as unknown as unknown[]).length > 0;
}

export async function grantChecklistAccess(schoolId: number, userId: number): Promise<void> {
  const database = await db();
  await database.execute(sql`
    INSERT INTO payroll_checklist_access (school_id, user_id)
    VALUES (${schoolId}, ${userId})
    ON CONFLICT (school_id, user_id) DO NOTHING
  `);
}

export async function loadSavedDay(schoolId: number, workDate: string): Promise<{
  id: number;
  note: string | null;
  lines: PayrollLineRow[];
} | null> {
  const database = await db();
  const days = await database.execute(sql`
    SELECT id, note FROM payroll_days
    WHERE school_id = ${schoolId} AND work_date = ${workDate}
    LIMIT 1
  `);
  const day = (days as unknown as { id: number; note: string | null }[])[0];
  if (!day) return null;
  const lines = await database.execute(sql`
    SELECT job_id, person_name, job_label, present, different_minutes, note,
           rate_cents_snapshot, weekly_minutes_snapshot, sort_order
    FROM payroll_day_lines
    WHERE payroll_day_id = ${day.id}
    ORDER BY sort_order, id
  `);
  return {
    id: Number(day.id),
    note: day.note,
    lines: (lines as unknown as Record<string, unknown>[]).map((row) => ({
      jobId: Number(row.job_id),
      personName: String(row.person_name),
      jobLabel: String(row.job_label),
      present: row.present === "away" ? "away" : "here",
      differentMinutes: row.different_minutes == null ? null : Number(row.different_minutes),
      note: row.note == null ? null : String(row.note),
      rateCentsSnapshot: Number(row.rate_cents_snapshot),
      weeklyMinutesSnapshot: Number(row.weekly_minutes_snapshot),
      sortOrder: Number(row.sort_order),
    })),
  };
}

export async function saveDay(args: {
  schoolId: number;
  workDate: string;
  note: string | null;
  savedBy: number;
  lines: PayrollLineRow[];
}): Promise<void> {
  const database = await db();
  const existing = await loadSavedDay(args.schoolId, args.workDate);
  let dayId = existing?.id;
  if (!dayId) {
    const inserted = await database.execute(sql`
      INSERT INTO payroll_days (school_id, work_date, note, saved_by)
      VALUES (${args.schoolId}, ${args.workDate}, ${args.note}, ${args.savedBy})
      RETURNING id
    `);
    dayId = Number((inserted as unknown as { id: number }[])[0]?.id);
  } else {
    await database.execute(sql`
      UPDATE payroll_days
      SET note = ${args.note}, saved_by = ${args.savedBy}, updated_at = NOW()
      WHERE id = ${dayId}
    `);
    await database.execute(sql`DELETE FROM payroll_day_lines WHERE payroll_day_id = ${dayId}`);
  }
  for (const line of args.lines) {
    await database.execute(sql`
      INSERT INTO payroll_day_lines (
        payroll_day_id, job_id, person_name, job_label, present, different_minutes, note,
        rate_cents_snapshot, weekly_minutes_snapshot, sort_order
      ) VALUES (
        ${dayId}, ${line.jobId}, ${line.personName}, ${line.jobLabel}, ${line.present},
        ${line.differentMinutes}, ${line.note}, ${line.rateCentsSnapshot},
        ${line.weeklyMinutesSnapshot}, ${line.sortOrder}
      )
    `);
  }
}

export async function updateJobRate(schoolId: number, jobId: number, rateCents: number, weeklyMinutes: number): Promise<boolean> {
  const database = await db();
  const updated = await database.execute(sql`
    UPDATE payroll_jobs
    SET rate_cents = ${rateCents}, weekly_minutes = ${weeklyMinutes}, updated_at = NOW()
    WHERE id = ${jobId} AND school_id = ${schoolId}
    RETURNING id
  `);
  return (updated as unknown as unknown[]).length > 0;
}

export async function addJob(args: {
  schoolId: number;
  personName: string;
  jobLabel: string;
  rateCents: number;
  weeklyMinutes: number;
}): Promise<number> {
  const database = await db();
  const key = `custom-${Date.now()}`;
  const inserted = await database.execute(sql`
    INSERT INTO payroll_jobs (school_id, job_key, person_name, job_label, rate_cents, weekly_minutes, sort_order)
    VALUES (
      ${args.schoolId}, ${key}, ${args.personName}, ${args.jobLabel},
      ${args.rateCents}, ${args.weeklyMinutes}, ${1000}
    )
    RETURNING id
  `);
  return Number((inserted as unknown as { id: number }[])[0]?.id);
}

export async function findUserSchoolId(userId: number): Promise<number | null> {
  const database = await getDb();
  if (!database) return null;
  const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  return user?.schoolId ?? null;
}
