import { sql } from 'drizzle-orm';
import { schools, type School } from '@shared/schema';
import { getDb } from '../db';
import { getSchoolCoreByRegistrationCode } from './school-db';
import { storage } from '../storage';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeRegistrationCode(raw: string): string {
  return raw.trim();
}

export async function generateUniqueRegistrationCode(): Promise<string> {
  const db = await getDb();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }

    const [existing] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(sql`LOWER(TRIM(${schools.registrationCode})) = LOWER(${result})`)
      .limit(1);

    if (!existing) {
      return result;
    }
    attempts++;
  }

  const timestamp = Date.now().toString(36).toUpperCase();
  return timestamp.substring(timestamp.length - 8);
}

/** Case-insensitive, trimmed match — used by public registration routes. */
export async function findSchoolByRegistrationCode(
  code: string,
): Promise<School | undefined> {
  const normalized = normalizeRegistrationCode(code);
  if (!normalized) {
    return undefined;
  }

  // Core SQL only — full Drizzle select() fails when F001 columns are not migrated yet.
  const core = await getSchoolCoreByRegistrationCode(normalized);
  if (core) {
    return core as School;
  }

  try {
    return await storage.getSchoolByCode(normalized);
  } catch (err) {
    console.warn('findSchoolByRegistrationCode storage fallback failed:', err);
    return undefined;
  }
}

/** Persist a registration code when the school row has none (e.g. after dev restore). */
export async function ensureSchoolRegistrationCode(
  schoolId: number,
): Promise<string | null> {
  const school = await storage.getSchool(schoolId);
  if (!school) {
    return null;
  }

  const existing = school.registrationCode?.trim();
  if (existing) {
    return existing;
  }

  const code = await generateUniqueRegistrationCode();
  await storage.updateSchool(schoolId, { registrationCode: code });
  console.log(`🔑 Generated registration code for school ${schoolId}: ${code}`);
  return code;
}
