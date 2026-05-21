import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { rowsFromExecute } from './db-execute-rows';

/** Columns that exist on schools before F001 / enabled_features migrations. */
const SCHOOL_ROW_SQL = sql`
  SELECT
    id,
    name,
    type,
    admin_id,
    address,
    city,
    state,
    zip_code,
    phone_number,
    email,
    website,
    logo,
    description,
    founded_year,
    accreditation,
    enrollment_size,
    is_verified,
    status,
    created_at,
    updated_at,
    registration_code,
    membership_fee_amount,
    membership_renewal_month,
    membership_renewal_day,
    membership_grace_period_days,
    membership_description,
    membership_required,
    free_after_threshold_enabled,
    free_after_threshold,
    onboarding_tour_enabled,
    show_subscription_status,
    membership_agreement_template,
    membership_agreement_version,
    membership_agreement_updated_at
  FROM schools
`;

function mapSchoolRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name),
    type: row.type as string,
    adminId: Number(row.admin_id),
    address: row.address != null ? String(row.address) : null,
    city: String(row.city),
    state: String(row.state),
    zipCode: String(row.zip_code),
    phoneNumber: row.phone_number != null ? String(row.phone_number) : null,
    email: String(row.email),
    website: row.website != null ? String(row.website) : null,
    logo: row.logo != null ? String(row.logo) : null,
    description: row.description != null ? String(row.description) : null,
    foundedYear: row.founded_year != null ? Number(row.founded_year) : null,
    accreditation: row.accreditation != null ? String(row.accreditation) : null,
    enrollmentSize: row.enrollment_size != null ? Number(row.enrollment_size) : null,
    isVerified: Boolean(row.is_verified),
    status: row.status as string,
    createdAt: new Date(row.created_at as string | Date),
    updatedAt: new Date(row.updated_at as string | Date),
    registrationCode: row.registration_code != null ? String(row.registration_code) : null,
    membershipFeeAmount: Number(row.membership_fee_amount ?? 0),
    membershipRenewalMonth: Number(row.membership_renewal_month ?? 9),
    membershipRenewalDay: Number(row.membership_renewal_day ?? 1),
    membershipGracePeriodDays: Number(row.membership_grace_period_days ?? 30),
    membershipDescription: row.membership_description != null ? String(row.membership_description) : null,
    membershipRequired: row.membership_required != null ? Boolean(row.membership_required) : true,
    freeAfterThresholdEnabled: Boolean(row.free_after_threshold_enabled ?? false),
    freeAfterThreshold: Number(row.free_after_threshold ?? 3),
    onboardingTourEnabled: row.onboarding_tour_enabled != null ? Boolean(row.onboarding_tour_enabled) : true,
    showSubscriptionStatus: Boolean(row.show_subscription_status ?? false),
    membershipAgreementTemplate:
      row.membership_agreement_template != null ? String(row.membership_agreement_template) : null,
    membershipAgreementVersion: String(row.membership_agreement_version ?? '1.0'),
    membershipAgreementUpdatedAt:
      row.membership_agreement_updated_at != null
        ? new Date(row.membership_agreement_updated_at as string | Date)
        : null,
    sessionModeEnabled: false,
    enabledFeatures: {},
  };
}

export type SchoolCoreRow = ReturnType<typeof mapSchoolRow>;

export async function getSchoolCoreById(id: number): Promise<SchoolCoreRow | undefined> {
  const db = await getDb();
  const result = await db.execute(sql`${SCHOOL_ROW_SQL} WHERE id = ${id} LIMIT 1`);
  const row = rowsFromExecute(result)[0];
  return row ? mapSchoolRow(row) : undefined;
}

/** Public registration links — avoids Drizzle selecting F001 columns missing on older DBs. */
export async function getSchoolCoreByRegistrationCode(
  code: string,
): Promise<SchoolCoreRow | undefined> {
  const normalized = code.trim();
  if (!normalized) {
    return undefined;
  }
  const db = await getDb();
  const result = await db.execute(sql`
    ${SCHOOL_ROW_SQL}
    WHERE LOWER(TRIM(registration_code)) = LOWER(TRIM(${normalized}))
    LIMIT 1
  `);
  const row = rowsFromExecute(result)[0];
  return row ? mapSchoolRow(row) : undefined;
}

export async function getAllSchoolsCore(): Promise<SchoolCoreRow[]> {
  const db = await getDb();
  const result = await db.execute(sql`${SCHOOL_ROW_SQL} ORDER BY id`);
  return rowsFromExecute(result).map(mapSchoolRow);
}

export type InsertSchoolCoreInput = {
  name: string;
  type: string;
  adminId: number;
  address?: string | null;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string | null;
  email: string;
  website?: string | null;
  description?: string | null;
  foundedYear?: number | null;
  accreditation?: string | null;
  enrollmentSize?: number | null;
  registrationCode: string;
  status?: string;
};

export async function insertSchoolCore(input: InsertSchoolCoreInput): Promise<SchoolCoreRow> {
  const db = await getDb();
  const result = await db.execute(sql`
    INSERT INTO schools (
      name,
      type,
      admin_id,
      address,
      city,
      state,
      zip_code,
      phone_number,
      email,
      website,
      description,
      founded_year,
      accreditation,
      enrollment_size,
      registration_code,
      status,
      is_verified
    ) VALUES (
      ${input.name},
      ${input.type},
      ${input.adminId},
      ${input.address ?? null},
      ${input.city},
      ${input.state},
      ${input.zipCode},
      ${input.phoneNumber ?? null},
      ${input.email},
      ${input.website ?? null},
      ${input.description ?? null},
      ${input.foundedYear ?? null},
      ${input.accreditation ?? null},
      ${input.enrollmentSize ?? null},
      ${input.registrationCode},
      ${input.status ?? 'active'},
      false
    )
    RETURNING id
  `);
  const insertRow = rowsFromExecute<{ id: number }>(result)[0];
  if (!insertRow) {
    throw new Error('School insert returned no row');
  }
  const id = Number(insertRow.id);
  const school = await getSchoolCoreById(id);
  if (!school) {
    throw new Error('School insert succeeded but row could not be loaded');
  }
  return school;
}
