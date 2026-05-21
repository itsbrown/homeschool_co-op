import { getRawPg } from './pg-raw';
import type { SchoolCoreRow } from './school-db';

export type PublicLocationRow = { id: number; name: string };

/** Idempotent — safe after dev DB restore when `locations` was never migrated. */
export async function ensureLocationsTable(): Promise<void> {
  const pg = getRawPg();
  await pg.unsafe(`
    CREATE TABLE IF NOT EXISTS locations (
      id serial PRIMARY KEY,
      school_id integer NOT NULL REFERENCES schools(id),
      name text NOT NULL,
      code text NOT NULL DEFAULT 'MAIN',
      address text NOT NULL DEFAULT '',
      city text NOT NULL DEFAULT '',
      state text NOT NULL DEFAULT '',
      zip_code text NOT NULL DEFAULT '',
      phone_number text,
      email text,
      manager_name text,
      capacity integer,
      is_active boolean NOT NULL DEFAULT true,
      timezone text NOT NULL DEFAULT 'America/New_York',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
}

export async function getPublicLocationsBySchoolId(
  schoolId: number,
): Promise<PublicLocationRow[]> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT id, name FROM locations
     WHERE school_id = $1 AND is_active = true
     ORDER BY name`,
    [schoolId],
  );
  return (rows as { id: number; name: string }[]).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
  }));
}

export async function createDefaultLocationForSchool(
  school: SchoolCoreRow,
): Promise<PublicLocationRow> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `INSERT INTO locations (school_id, name, code, address, city, state, zip_code, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id, name`,
    [
      school.id,
      'Main Campus',
      'MAIN',
      school.address || 'TBD',
      school.city,
      school.state,
      school.zipCode,
    ],
  );
  const row = rows[0] as { id: number; name: string } | undefined;
  if (!row) {
    throw new Error('Location insert returned no row');
  }
  return { id: Number(row.id), name: String(row.name) };
}
