import { and, eq, lte, gte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { events, type Event } from "@shared/schema";

function dateOverlap(startDate: Date, endDate: Date) {
  return and(lte(events.startDate, endDate), gte(events.endDate, startDate));
}

export async function getEventsBySchoolAndDateRange(
  schoolId: number,
  startDate: Date,
  endDate: Date,
): Promise<Event[]> {
  const db = await getDb();
  return db
    .select()
    .from(events)
    .where(and(eq(events.schoolId, schoolId), dateOverlap(startDate, endDate)))
    .orderBy(events.startDate);
}

export async function getEventsBySchool(schoolId: number): Promise<Event[]> {
  const db = await getDb();
  return db.select().from(events).where(eq(events.schoolId, schoolId)).orderBy(events.startDate);
}

export async function getEventsForSchoolsAndDateRange(
  schoolIds: number[],
  startDate: Date,
  endDate: Date,
): Promise<Event[]> {
  if (schoolIds.length === 0) return [];
  const db = await getDb();
  return db
    .select()
    .from(events)
    .where(and(inArray(events.schoolId, schoolIds), dateOverlap(startDate, endDate)))
    .orderBy(events.startDate);
}
