import { sql } from 'drizzle-orm';
import { schools, type School } from '@shared/schema';
import { getDb } from '../db';
import { getSchoolCoreById, getSchoolCoreByRegistrationCode } from './school-db';
import { getRawPg } from './pg-raw';

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

  const core = await getSchoolCoreByRegistrationCode(normalized);
  return core ? (core as School) : undefined;
}

/** Persist a registration code when the school row has none (e.g. after dev restore). */
export async function ensureSchoolRegistrationCode(
  schoolId: number,
): Promise<string | null> {
  const school = await getSchoolCoreById(schoolId);
  if (!school) {
    return null;
  }

  const existing = school.registrationCode?.trim();
  if (existing) {
    return existing;
  }

  const code = await generateUniqueRegistrationCode();
  const pg = getRawPg();
  await pg.unsafe(
    `UPDATE schools SET registration_code = $1, updated_at = NOW() WHERE id = $2`,
    [code, schoolId],
  );
  console.log(`🔑 Generated registration code for school ${schoolId}: ${code}`);
  return code;
}
