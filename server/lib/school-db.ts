import { getRawPg } from './pg-raw';

/** Columns that exist on schools before F001 / enabled_features migrations. */
const SCHOOL_SELECT = `
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
    enabledFeatures: {} as Record<string, boolean>,
  };
}

export type SchoolCoreRow = ReturnType<typeof mapSchoolRow>;

export async function getSchoolCoreById(id: number): Promise<SchoolCoreRow | undefined> {
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${SCHOOL_SELECT} FROM schools WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapSchoolRow(row) : undefined;
}

/** First school this user administers (schools.admin_id). */
export async function getSchoolCoreByAdminId(
  adminUserId: number,
): Promise<SchoolCoreRow | undefined> {
  const schools = await getSchoolsCoreByAdminId(adminUserId);
  return schools[0];
}

/** All schools linked via schools.admin_id (multi-school admins). */
export async function getSchoolsCoreByAdminId(adminUserId: number): Promise<SchoolCoreRow[]> {
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${SCHOOL_SELECT} FROM schools WHERE admin_id = $1 ORDER BY id`,
    [adminUserId],
  );
  return (rows as Record<string, unknown>[]).map(mapSchoolRow);
}

/** Public registration links — avoids Drizzle selecting F001 columns missing on older DBs. */
export async function getSchoolCoreByRegistrationCode(
  code: string,
): Promise<SchoolCoreRow | undefined> {
  const normalized = code.trim();
  if (!normalized) {
    return undefined;
  }
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `SELECT ${SCHOOL_SELECT} FROM schools
     WHERE LOWER(TRIM(registration_code)) = LOWER(TRIM($1))
     LIMIT 1`,
    [normalized],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapSchoolRow(row) : undefined;
}

export async function getAllSchoolsCore(): Promise<SchoolCoreRow[]> {
  const pg = getRawPg();
  const rows = await pg.unsafe(`SELECT ${SCHOOL_SELECT} FROM schools ORDER BY id`);
  return (rows as Record<string, unknown>[]).map(mapSchoolRow);
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
  const pg = getRawPg();
  const rows = await pg.unsafe(
    `INSERT INTO schools (
      name, type, admin_id, address, city, state, zip_code, phone_number, email,
      website, description, founded_year, accreditation, enrollment_size,
      registration_code, status, is_verified
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false)
    RETURNING id`,
    [
      input.name,
      input.type,
      input.adminId,
      input.address ?? null,
      input.city,
      input.state,
      input.zipCode,
      input.phoneNumber ?? null,
      input.email,
      input.website ?? null,
      input.description ?? null,
      input.foundedYear ?? null,
      input.accreditation ?? null,
      input.enrollmentSize ?? null,
      input.registrationCode,
      input.status ?? 'active',
    ],
  );
  const id = Number((rows[0] as { id: number }).id);
  const school = await getSchoolCoreById(id);
  if (!school) {
    throw new Error('School insert succeeded but row could not be loaded');
  }
  return school;
}
