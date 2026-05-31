import type { InsertLocation, Location } from '@shared/schema';
import { getRawPg } from './pg-raw';

export type PublicLocationRow = {
  id: number;
  name: string;
  activationStatus?: string | null;
  activationThreshold?: number | null;
  eligibleStudentCount?: number;
};

const LOCATION_COLUMNS = `
  id,
  school_id,
  name,
  code,
  address,
  city,
  state,
  zip_code,
  phone_number,
  email,
  manager_name,
  capacity,
  is_active,
  timezone,
  activation_threshold,
  activation_status,
  notice_started_at,
  charge_scheduled_at,
  activated_at,
  collection_deadline,
  activation_notice_hours,
  created_at,
  updated_at
`;

function mapLocationRow(row: Record<string, unknown>): Location {
  return {
    id: Number(row.id),
    schoolId: Number(row.school_id),
    name: String(row.name),
    code: String(row.code),
    address: String(row.address),
    city: String(row.city),
    state: String(row.state),
    zipCode: String(row.zip_code),
    phoneNumber: row.phone_number != null ? String(row.phone_number) : null,
    email: row.email != null ? String(row.email) : null,
    managerName: row.manager_name != null ? String(row.manager_name) : null,
    capacity: row.capacity != null ? Number(row.capacity) : null,
    isActive: Boolean(row.is_active),
    timezone: String(row.timezone ?? 'America/New_York'),
    activationThreshold:
      row.activation_threshold != null ? Number(row.activation_threshold) : null,
    activationStatus:
      row.activation_status != null
        ? (String(row.activation_status) as Location['activationStatus'])
        : null,
    noticeStartedAt: row.notice_started_at
      ? new Date(row.notice_started_at as string | Date)
      : null,
    chargeScheduledAt: row.charge_scheduled_at
      ? new Date(row.charge_scheduled_at as string | Date)
      : null,
    activatedAt: row.activated_at ? new Date(row.activated_at as string | Date) : null,
    collectionDeadline: row.collection_deadline
      ? new Date(row.collection_deadline as string | Date)
      : null,
    activationNoticeHours:
      row.activation_notice_hours != null
        ? Number(row.activation_notice_hours)
        : 72,
    createdAt: new Date(row.created_at as string | Date),
    updatedAt: new Date(row.updated_at as string | Date),
  };
}

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
      activation_threshold integer,
      activation_status text,
      notice_started_at timestamp,
      charge_scheduled_at timestamp,
      activated_at timestamp,
      collection_deadline timestamp,
      activation_notice_hours integer NOT NULL DEFAULT 72,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await pg.unsafe(`
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_threshold integer;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_status text;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS notice_started_at timestamp;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS charge_scheduled_at timestamp;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS activated_at timestamp;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_deadline timestamp;
    ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_notice_hours integer NOT NULL DEFAULT 72;
  `);
  await pg.unsafe(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location_id integer REFERENCES locations(id);
    ALTER TABLE program_enrollments ADD COLUMN IF NOT EXISTS location_id integer REFERENCES locations(id);
  `);
  await pg.unsafe(`
    UPDATE locations
    SET activation_status = 'activated'
    WHERE activation_threshold IS NULL
      AND (activation_status IS NULL OR activation_status = '');
  `);
}

export async function getLocationCore(id: number): Promise<Location | undefined> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapLocationRow(row) : undefined;
}

export async function getLocationsBySchoolIdCore(schoolId: number): Promise<Location[]> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${LOCATION_COLUMNS} FROM locations
     WHERE school_id = $1 AND is_active = true
     ORDER BY name`,
    [schoolId],
  );
  return (rows as Record<string, unknown>[]).map(mapLocationRow);
}

export async function getAllLocationsCore(): Promise<Location[]> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE is_active = true ORDER BY name`,
  );
  return (rows as Record<string, unknown>[]).map(mapLocationRow);
}

export async function countEligibleActivationStudents(
  locationId: number,
): Promise<number> {
  await ensureLocationsTable();
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT COUNT(DISTINCT pe.child_id)::int AS count
     FROM program_enrollments pe
     INNER JOIN children c ON c.id = pe.child_id
     INNER JOIN users u ON u.id = c.parent_id
     INNER JOIN sessions s ON s.id = pe.session_id
     WHERE pe.status = 'location_wishlist'
       AND (pe.location_id = $1 OR s.location_id = $1)
       AND u.stripe_default_payment_method_id IS NOT NULL
       AND u.stripe_default_payment_method_id <> ''`,
    [locationId],
  );
  const row = rows[0] as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export async function getPublicLocationsBySchoolId(
  schoolId: number,
): Promise<PublicLocationRow[]> {
  const locations = (await getLocationsBySchoolIdCore(schoolId)).filter(
    (row) => row.activationStatus !== 'cancelled',
  );
  const result: PublicLocationRow[] = [];
  for (const row of locations) {
    const base: PublicLocationRow = {
      id: row.id,
      name: row.name,
      activationStatus: row.activationStatus,
      activationThreshold: row.activationThreshold,
    };
    if (
      row.activationThreshold != null &&
      row.activationThreshold > 0 &&
      (row.activationStatus === 'collecting' || row.activationStatus === 'notice_period')
    ) {
      try {
        base.eligibleStudentCount = await countEligibleActivationStudents(row.id);
      } catch (error) {
        console.warn(
          `[locations] eligibleStudentCount unavailable for location ${row.id}:`,
          error instanceof Error ? error.message : error,
        );
        base.eligibleStudentCount = 0;
      }
    }
    result.push(base);
  }
  return result;
}

/**
 * Blocks the old registration auto-seed (Main Campus + MAIN + placeholder address).
 * Manual admin creates with a real street address are still allowed.
 */
export function isBlockedMainCampusAutoSeed(
  location: Pick<InsertLocation, 'name' | 'code' | 'address'>,
): boolean {
  const name = location.name?.trim().toLowerCase();
  const code = location.code?.trim().toUpperCase();
  const address = location.address?.trim() ?? '';
  return name === 'main campus' && code === 'MAIN' && (address === 'TBD' || address === '');
}

export async function createLocationCore(location: InsertLocation): Promise<Location> {
  if (
    isBlockedMainCampusAutoSeed(location) &&
    process.env.ALLOW_MAIN_CAMPUS_AUTO_SEED !== 'true'
  ) {
    const err = new Error(
      'Refusing to auto-create Main Campus. Add locations in School → Location Management.',
    );
    console.error('[locations] Blocked Main Campus insert. Call stack:', new Error().stack);
    throw err;
  }
  await ensureLocationsTable();
  const pg = getRawPg();

  const hasThreshold =
    location.activationThreshold != null && location.activationThreshold > 0;
  const activationStatus =
    location.activationStatus ??
    (hasThreshold ? 'collecting' : 'activated');

  const rows = await pg.unsafe(
    `INSERT INTO locations (
      school_id, name, code, address, city, state, zip_code,
      phone_number, email, manager_name, capacity, is_active, timezone,
      activation_threshold, activation_status, collection_deadline, activation_notice_hours
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING ${LOCATION_COLUMNS}`,
    [
      location.schoolId,
      location.name,
      location.code,
      location.address,
      location.city,
      location.state,
      location.zipCode,
      location.phoneNumber ?? null,
      location.email ?? null,
      location.managerName ?? null,
      location.capacity ?? null,
      location.isActive ?? true,
      location.timezone || 'America/New_York',
      hasThreshold ? location.activationThreshold : null,
      hasThreshold ? activationStatus : 'activated',
      location.collectionDeadline ?? null,
      location.activationNoticeHours ?? 72,
    ],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('Location insert returned no row');
  }
  return mapLocationRow(row);
}

export async function updateLocationCore(
  id: number,
  update: Partial<InsertLocation>,
): Promise<Location | undefined> {
  await ensureLocationsTable();
  const existing = await getLocationCore(id);
  if (!existing) {
    return undefined;
  }

  const merged: InsertLocation = {
    schoolId: update.schoolId ?? existing.schoolId,
    name: update.name ?? existing.name,
    code: update.code ?? existing.code,
    address: update.address ?? existing.address,
    city: update.city ?? existing.city,
    state: update.state ?? existing.state,
    zipCode: update.zipCode ?? existing.zipCode,
    phoneNumber: update.phoneNumber !== undefined ? update.phoneNumber : existing.phoneNumber,
    email: update.email !== undefined ? update.email : existing.email,
    managerName: update.managerName !== undefined ? update.managerName : existing.managerName,
    capacity: update.capacity !== undefined ? update.capacity : existing.capacity,
    isActive: update.isActive ?? existing.isActive,
    timezone: update.timezone ?? existing.timezone,
    activationThreshold:
      update.activationThreshold !== undefined
        ? update.activationThreshold
        : existing.activationThreshold,
    activationStatus:
      update.activationStatus !== undefined
        ? update.activationStatus
        : existing.activationStatus,
    activationNoticeHours:
      update.activationNoticeHours ?? existing.activationNoticeHours,
    collectionDeadline:
      update.collectionDeadline !== undefined
        ? update.collectionDeadline
        : existing.collectionDeadline,
  };

  const pg = getRawPg();
  const rows = await pg.unsafe(
    `UPDATE locations SET
      school_id = $2,
      name = $3,
      code = $4,
      address = $5,
      city = $6,
      state = $7,
      zip_code = $8,
      phone_number = $9,
      email = $10,
      manager_name = $11,
      capacity = $12,
      is_active = $13,
      timezone = $14,
      activation_threshold = $15,
      activation_status = $16,
      collection_deadline = $17,
      activation_notice_hours = $18,
      updated_at = now()
     WHERE id = $1
     RETURNING ${LOCATION_COLUMNS}`,
    [
      id,
      merged.schoolId,
      merged.name,
      merged.code,
      merged.address,
      merged.city,
      merged.state,
      merged.zipCode,
      merged.phoneNumber,
      merged.email,
      merged.managerName,
      merged.capacity,
      merged.isActive,
      merged.timezone,
      merged.activationThreshold,
      merged.activationStatus,
      merged.collectionDeadline,
      merged.activationNoticeHours ?? 72,
    ],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapLocationRow(row) : undefined;
}

export async function updateLocationActivationFields(
  id: number,
  fields: {
    activationStatus?: Location['activationStatus'];
    noticeStartedAt?: Date | null;
    chargeScheduledAt?: Date | null;
    activatedAt?: Date | null;
  },
): Promise<Location | undefined> {
  await ensureLocationsTable();
  const existing = await getLocationCore(id);
  if (!existing) return undefined;

  const pg = getRawPg();
  const rows = await pg.unsafe(
    `UPDATE locations SET
      activation_status = COALESCE($2, activation_status),
      notice_started_at = COALESCE($3, notice_started_at),
      charge_scheduled_at = COALESCE($4, charge_scheduled_at),
      activated_at = COALESCE($5, activated_at),
      updated_at = now()
     WHERE id = $1
     RETURNING ${LOCATION_COLUMNS}`,
    [
      id,
      fields.activationStatus ?? null,
      fields.noticeStartedAt ?? null,
      fields.chargeScheduledAt ?? null,
      fields.activatedAt ?? null,
    ],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapLocationRow(row) : undefined;
}

export async function deleteLocationCore(id: number): Promise<void> {
  await ensureLocationsTable();
  const pg = getRawPg();
  await pg.unsafe(
    `UPDATE locations SET is_active = false, updated_at = now() WHERE id = $1`,
    [id],
  );
}
