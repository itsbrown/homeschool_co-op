/**
 * Pure helpers for the one-way prod → dev mask.
 * This module never opens a database connection.
 *
 * The source role is read-only. The target is the only writable role, and
 * only after assertSafeMaskTarget() accepts it.
 */

import { normalizeDatabaseUrl } from "../../server/lib/database-url.mjs";

export const SOURCE_STARTUP_OPTIONS = "-c default_transaction_read_only=on";

export const MASKED_PASSWORD = "masked-no-login";

/** Columns that must never be copied onto the dev insert, even if present on the source row. */
export const DROPPED_COLUMNS = {
  users: [
    "auth0_id",
    "supabase_id",
    "stripe_customer_id",
    "stripe_default_payment_method_id",
    "calendar_feed_token",
    "avatar",
  ],
  children: [
    "gender",
    "allergies",
    "medical_info",
    "special_needs",
    "interests",
    "notes",
    "emergency_contact",
    "profile_image",
    "current_lexile_range",
    "current_reading_grade_level",
    "current_book_list",
    "current_math_level",
    "learning_style",
    "additional_languages",
  ],
  program_enrollments: [
    "effective_balance",
    "stripe_subscription_id",
    "stripe_customer_id",
  ],
};

const FIRST_NAMES = [
  "Avery", "Blair", "Casey", "Drew", "Eden", "Finley", "Gray", "Harper",
  "Indigo", "Jules", "Kai", "Logan", "Marlow", "Nico", "Oakley", "Parker",
  "Quinn", "Reese", "Shay", "Tatum",
];

const LAST_NAMES = [
  "Brooks", "Dale", "Ellis", "Frost", "Greer", "Hayes", "Iverson", "Juleson",
  "Keene", "Lane", "Marsh", "North", "Oak", "Penn", "Quill", "Rowe",
];

const PROD_LABEL = /(^|[^a-z0-9])(prod|production)([^a-z0-9]|$)/i;
const DEV_DATABASE = /(dev|mask|scratch|local|test)/i;

const BAND_AGE = {
  prek_k: 4,
  grades_1_3: 7,
  grades_4_8: 11,
  grades_9_12: 16,
  adult: 30,
};

export class MaskRefused extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MaskRefused";
    this.code = code;
  }
}

export function stableIndex(seed, modulo) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}

export function maskPhone(id) {
  const n = Math.abs(Number(id) || 0) % 10000;
  return `555-010-${String(n).padStart(4, "0")}`;
}

export function maskEmail(kind, id) {
  return `${kind}-${id}@masked.invalid`;
}

export function maskStreet(id) {
  return `${100 + (Math.abs(Number(id) || 0) % 800)} Masked Lane`;
}

export function ageBandFromBirthdate(birthdate, now = new Date()) {
  if (!birthdate) return "unknown";
  const bd = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return "unknown";
  let age = now.getFullYear() - bd.getFullYear();
  const month = now.getMonth() - bd.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < bd.getDate())) age -= 1;
  if (age <= 5) return "prek_k";
  if (age <= 8) return "grades_1_3";
  if (age <= 13) return "grades_4_8";
  if (age <= 18) return "grades_9_12";
  return "adult";
}

export function anchorBirthdate(band, now = new Date()) {
  const age = BAND_AGE[band] ?? BAND_AGE.grades_1_3;
  return `${now.getFullYear() - age}-01-01`;
}

export function parseDatabaseUrl(rawUrl) {
  const normalized = normalizeDatabaseUrl(rawUrl);
  if (!normalized || typeof normalized !== "string") {
    throw new MaskRefused("invalid_url", "Database URL is empty");
  }
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new MaskRefused("invalid_url", "Database URL could not be parsed");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new MaskRefused("invalid_url", "Only postgres URLs are accepted");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] || "");
  if (!database) {
    throw new MaskRefused("invalid_url", "Database name is missing");
  }
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database,
  };
}

export function describeIdentity(identity) {
  return `${identity.host}:${identity.port}/${identity.database}`;
}

export function identitiesEqual(left, right) {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function looksLikeProd(identity) {
  return PROD_LABEL.test(identity.host) || PROD_LABEL.test(identity.database);
}

/**
 * Refuse when the target is the source database or looks like production.
 * Password differences do not make two URLs different databases.
 */
export function assertSafeMaskTarget({ sourceUrl, targetUrl, nodeEnv = process.env.NODE_ENV }) {
  if (nodeEnv === "production") {
    throw new MaskRefused("production_process", "Refusing to run when NODE_ENV=production");
  }
  if (!sourceUrl || !targetUrl) {
    throw new MaskRefused(
      "missing_url",
      "MASK_SOURCE_DATABASE_URL and MASK_TARGET_DATABASE_URL are both required",
    );
  }
  if (String(sourceUrl).trim() === String(targetUrl).trim()) {
    throw new MaskRefused("same_url", "Target URL equals the source URL");
  }
  const source = parseDatabaseUrl(sourceUrl);
  const target = parseDatabaseUrl(targetUrl);
  if (identitiesEqual(source, target)) {
    throw new MaskRefused(
      "same_database",
      "Target host, port, and database equal the source. Refusing to write.",
    );
  }
  if (looksLikeProd(target)) {
    throw new MaskRefused(
      "target_looks_like_prod",
      `Target ${describeIdentity(target)} looks like production`,
    );
  }
  if (source.host === target.host && source.port === target.port) {
    if (!DEV_DATABASE.test(target.database)) {
      throw new MaskRefused(
        "same_host",
        "Target is on the source host and its database name is not an explicit dev, mask, scratch, local, or test name",
      );
    }
  }
  return { source, target };
}

export function assertSourceReadOnlySetting(value) {
  if (String(value).trim().toLowerCase() !== "on") {
    throw new MaskRefused(
      "source_not_readonly",
      "Source default_transaction_read_only is not on. Refusing before any write.",
    );
  }
}

export function assertConnectedEndpoints({ sourceDatabase, targetDatabase, verdict }) {
  if (sourceDatabase !== verdict.source.database) {
    throw new MaskRefused(
      "source_mismatch",
      "Connected source database name does not match MASK_SOURCE_DATABASE_URL",
    );
  }
  if (targetDatabase !== verdict.target.database) {
    throw new MaskRefused(
      "target_mismatch",
      "Connected target database name does not match MASK_TARGET_DATABASE_URL",
    );
  }
  if (
    sourceDatabase === targetDatabase &&
    verdict.source.host === verdict.target.host &&
    verdict.source.port === verdict.target.port
  ) {
    throw new MaskRefused("same_database", "Connected source and target are the same database");
  }
}

export function assertIdent(name) {
  if (!/^[a-z_]+$/.test(name)) {
    throw new MaskRefused("bad_ident", "Table name is not an allowlisted identifier");
  }
}

export function assertSqlIsSelect(sqlText) {
  const stripped = String(sqlText)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
  if (!/^select\b/i.test(stripped)) {
    throw new MaskRefused("source_write", "Source connection only runs SELECT");
  }
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|comment|vacuum|reindex)\b/i.test(stripped)) {
    throw new MaskRefused("source_write", "Source SQL contains a write keyword");
  }
}

export function selectAllSql(table) {
  assertIdent(table);
  const sqlText = `select * from ${table}`;
  assertSqlIsSelect(sqlText);
  return sqlText;
}

export const COPY_TABLES = [
  "schools",
  "locations",
  "users",
  "user_roles",
  "children",
  "emergency_contacts",
  "child_guardians",
  "school_students",
  "sessions",
  "school_classes",
  "classes",
  "program_enrollments",
  "school_class_enrollments",
  "events",
  "store_products",
  "store_orders",
  "store_order_items",
  "weekly_skeletons",
  "skeleton_blocks",
  "curriculum_assets",
  "week_plans",
  "week_plan_blocks",
];

export function truncateSql(tables = COPY_TABLES) {
  if (!tables.length) {
    throw new MaskRefused("empty_truncate", "Refusing to truncate an empty table list");
  }
  for (const table of tables) {
    assertIdent(table);
    if (!COPY_TABLES.includes(table)) {
      throw new MaskRefused("not_allowlisted", `Refusing to truncate ${table}`);
    }
  }
  return `truncate table ${tables.join(", ")} restart identity cascade`;
}

function fakeFirst(seed) {
  return FIRST_NAMES[stableIndex(seed, FIRST_NAMES.length)];
}

function fakeLast(seed) {
  return LAST_NAMES[stableIndex(seed, LAST_NAMES.length)];
}

export function maskUser(row) {
  const id = row.id;
  const first = fakeFirst(`user-first-${id}`);
  const last = fakeLast(`user-last-${id}`);
  return {
    id,
    username: `user_${id}`,
    email: maskEmail("user", id),
    password: MASKED_PASSWORD,
    role: row.role ?? "parent",
    name: `${first} ${last}`,
    first_name: first,
    last_name: last,
    school_id: row.school_id ?? null,
    location_id: row.location_id ?? null,
    phone: maskPhone(id),
    emergency_contact_first_name: row.emergency_contact_first_name ? "Emergency" : null,
    emergency_contact_last_name: row.emergency_contact_last_name ? "Contact" : null,
    emergency_contact_phone: row.emergency_contact_phone ? maskPhone(Number(id) + 100000) : null,
    emergency_contact_relationship: row.emergency_contact_relationship ? "relative" : null,
    is_active: row.is_active !== false,
    active_role: row.active_role ?? null,
    active_role_id: null,
    subscription: row.subscription ?? "free",
    permissions: {},
    has_completed_onboarding: Boolean(row.has_completed_onboarding),
    member_id: row.member_id ? `MASK-${id}` : null,
    auto_pay_enabled: false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function maskChild(row, usersById, now = new Date()) {
  const band = ageBandFromBirthdate(row.birthdate, now);
  const storedBand = band === "unknown" ? "unknown" : band;
  const anchorBand = band === "unknown" ? "grades_1_3" : band;
  const parent = usersById.get(row.parent_id);
  return {
    id: row.id,
    parent_id: row.parent_id,
    parent_email: parent?.email ?? maskEmail("user", row.parent_id),
    first_name: fakeFirst(`child-first-${row.id}`),
    last_name: "Student",
    birthdate: anchorBirthdate(anchorBand, now),
    grade_level: storedBand,
    gender: null,
    school: null,
    school_id: row.school_id ?? null,
    location_id: row.location_id ?? null,
    learning_style: null,
    special_needs: null,
    interests: null,
    allergies: null,
    medical_info: null,
    profile_image: null,
    emergency_contact: null,
    additional_languages: null,
    notes: null,
    current_lexile_range: null,
    current_reading_grade_level: null,
    current_book_list: null,
    current_math_level: null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function maskSchool(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    admin_id: row.admin_id,
    address: maskStreet(row.id),
    city: row.city,
    state: row.state,
    zip_code: "00000",
    phone_number: maskPhone(row.id),
    email: maskEmail("school", row.id),
    website: null,
    logo: null,
    description: row.description ?? null,
    registration_code: row.registration_code ?? null,
    status: row.status ?? "active",
    is_verified: Boolean(row.is_verified),
    session_mode_enabled: Boolean(row.session_mode_enabled),
    enabled_features: row.enabled_features ?? {},
    public_store_enabled: Boolean(row.public_store_enabled),
    public_store_settings: row.public_store_settings ?? {},
    store_slug: row.store_slug ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function maskLocation(row) {
  return {
    id: row.id,
    school_id: row.school_id,
    name: row.name,
    code: row.code,
    address: maskStreet(row.id),
    city: row.city,
    state: row.state,
    zip_code: "00000",
    phone_number: row.phone_number ? maskPhone(row.id) : null,
    email: row.email ? maskEmail("campus", row.id) : null,
    manager_name: row.manager_name ? `Manager ${row.id}` : null,
    capacity: row.capacity ?? null,
    is_active: row.is_active !== false,
    timezone: row.timezone ?? "America/New_York",
    door_codes_enabled: Boolean(row.door_codes_enabled),
    activation_threshold: row.activation_threshold ?? null,
    activation_status: row.activation_status ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function maskClass(row) {
  return {
    id: row.id,
    type: row.type ?? "school_admin",
    school_id: row.school_id ?? null,
    location_id: row.location_id ?? null,
    category_id: null,
    title: row.title,
    description: row.description,
    category: row.category,
    grade_levels: row.grade_levels ?? null,
    session_id: row.session_id ?? null,
    auto_place_by_grade: Boolean(row.auto_place_by_grade),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    schedule: row.schedule ?? null,
    capacity: row.capacity ?? null,
    price: row.price ?? 0,
    instructor_id: row.instructor_id ?? null,
    is_published: Boolean(row.is_published),
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    session_days: row.session_days ?? null,
    status: row.status ?? "upcoming",
    location: row.location ?? null,
    instructor_name: row.instructor_name ? `Mentor ${row.instructor_id ?? row.id}` : null,
    location_name: row.location_name ?? null,
    location_address: null,
    is_virtual: Boolean(row.is_virtual),
    meeting_url: null,
    curriculum_id: null,
    age_range: row.age_range ?? null,
    schedule_type: row.schedule_type ?? null,
    schedule_details: row.schedule_details ?? null,
    enrollment_open: Boolean(row.enrollment_open),
    require_member_id: Boolean(row.require_member_id),
    enrollment_count: row.enrollment_count ?? 0,
    is_admin_only: Boolean(row.is_admin_only),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function maskEnrollment(row, childrenById, usersById) {
  const child = childrenById.get(row.child_id);
  const parent = usersById.get(row.parent_id);
  return {
    id: row.id,
    school_id: row.school_id,
    class_type: row.class_type ?? "school_class",
    class_id: row.class_id ?? null,
    marketplace_class_id: row.marketplace_class_id ?? null,
    program_id: null,
    session_id: row.session_id ?? null,
    child_id: row.child_id,
    child_name: child ? `${child.first_name} ${child.last_name}` : `Student ${row.child_id}`,
    class_name: row.class_name,
    variant_id: row.variant_id ?? null,
    parent_id: row.parent_id,
    parent_email: parent?.email ?? maskEmail("user", row.parent_id),
    location_id: row.location_id ?? null,
    total_cost: row.total_cost ?? 0,
    total_paid: row.total_paid ?? 0,
    remaining_balance: row.remaining_balance ?? 0,
    deposit_required: row.deposit_required ?? 0,
    payment_status: row.payment_status ?? "pending",
    payment_plan: row.payment_plan ?? null,
    payment_frequency: row.payment_frequency ?? null,
    payment_system_version: row.payment_system_version ?? null,
    program_start_date: row.program_start_date ?? null,
    program_end_date: row.program_end_date ?? null,
    status: row.status ?? "enrolled",
    waitlist_position: row.waitlist_position ?? null,
    enrollment_date: row.enrollment_date ?? null,
    notes: null,
    metadata: {},
    enrollment_version: row.enrollment_version ?? "v1",
    day_type: row.day_type ?? null,
    enrolled_half_day_price: row.enrolled_half_day_price ?? null,
    enrolled_full_day_price: row.enrolled_full_day_price ?? null,
    family_plan_id: null,
    comp_amount_cents: row.comp_amount_cents ?? 0,
    comp_reason: null,
    comp_by: null,
    placement_source: row.placement_source ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function rowsOf(sourceRowsByTable, table) {
  return sourceRowsByTable[table] ?? [];
}

/**
 * Build the dev insert plan from source rows already read with SELECT.
 * Does not connect. Drops auth, Stripe, medical, and exact child birthdays.
 */
export function planCopy(sourceRowsByTable, now = new Date()) {
  const users = rowsOf(sourceRowsByTable, "users").map((row) => maskUser(row));
  const usersById = new Map(users.map((row) => [row.id, row]));
  const children = rowsOf(sourceRowsByTable, "children").map((row) => maskChild(row, usersById, now));
  const childrenById = new Map(children.map((row) => [row.id, row]));

  const tables = [
    { table: "schools", rows: rowsOf(sourceRowsByTable, "schools").map(maskSchool) },
    { table: "locations", rows: rowsOf(sourceRowsByTable, "locations").map(maskLocation) },
    { table: "users", rows: users },
    {
      table: "user_roles",
      rows: rowsOf(sourceRowsByTable, "user_roles").map((row) => ({
        id: row.id,
        user_id: row.user_id,
        role: row.role,
        school_id: row.school_id ?? null,
        is_primary: Boolean(row.is_primary),
        created_at: row.created_at ?? null,
      })),
    },
    { table: "children", rows: children },
    {
      table: "emergency_contacts",
      rows: rowsOf(sourceRowsByTable, "emergency_contacts").map((row) => ({
        id: row.id,
        user_id: row.user_id,
        first_name: "Emergency",
        last_name: "Contact",
        relationship: "relative",
        phone_number: maskPhone(row.id),
        email: null,
        is_authorized_pickup: Boolean(row.is_authorized_pickup),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "child_guardians",
      rows: rowsOf(sourceRowsByTable, "child_guardians").map((row) => ({
        id: row.id,
        child_id: row.child_id,
        guardian_user_id: row.guardian_user_id,
        relationship: row.relationship,
        notes: null,
        added_by: row.added_by,
        is_primary: Boolean(row.is_primary),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "school_students",
      rows: rowsOf(sourceRowsByTable, "school_students").map((row) => ({
        id: row.id,
        school_id: row.school_id,
        location_id: row.location_id ?? null,
        child_id: row.child_id,
        enrollment_date: row.enrollment_date ?? null,
        grade: childrenById.get(row.child_id)?.grade_level ?? "unknown",
        status: row.status ?? "active",
        student_id: null,
        notes: null,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "sessions",
      rows: rowsOf(sourceRowsByTable, "sessions").map((row) => ({
        id: row.id,
        school_id: row.school_id,
        name: row.name,
        description: row.description ?? null,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status ?? "upcoming",
        enrollment_open: Boolean(row.enrollment_open),
        enrollment_closed_message: row.enrollment_closed_message ?? null,
        require_member_id: Boolean(row.require_member_id),
        location_id: row.location_id ?? null,
        half_day_days: row.half_day_days ?? null,
        full_day_days: row.full_day_days ?? null,
        half_day_start_time: row.half_day_start_time ?? null,
        half_day_end_time: row.half_day_end_time ?? null,
        full_day_start_time: row.full_day_start_time ?? null,
        full_day_end_time: row.full_day_end_time ?? null,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "school_classes",
      rows: rowsOf(sourceRowsByTable, "school_classes").map((row) => ({
        id: row.id,
        school_id: row.school_id,
        location_id: row.location_id ?? null,
        title: row.title,
        description: row.description ?? null,
        subject: row.subject,
        grade_level: row.grade_level,
        teacher_id: row.teacher_id ?? null,
        academic_year: row.academic_year,
        semester: row.semester ?? null,
        schedule: row.schedule,
        location: row.location ?? null,
        max_enrollment: row.max_enrollment,
        current_enrollment: row.current_enrollment ?? 0,
        curriculum_id: null,
        status: row.status ?? "draft",
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    { table: "classes", rows: rowsOf(sourceRowsByTable, "classes").map(maskClass) },
    {
      table: "program_enrollments",
      rows: rowsOf(sourceRowsByTable, "program_enrollments").map((row) =>
        maskEnrollment(row, childrenById, usersById),
      ),
    },
    {
      table: "school_class_enrollments",
      rows: rowsOf(sourceRowsByTable, "school_class_enrollments").map((row) => ({
        id: row.id,
        class_id: row.class_id,
        student_id: row.student_id,
        enrollment_date: row.enrollment_date ?? null,
        grade: null,
        status: row.status ?? "enrolled",
        notes: null,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "events",
      rows: rowsOf(sourceRowsByTable, "events").map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        start_date: row.start_date,
        end_date: row.end_date,
        location: row.location ?? null,
        organizer_id: row.organizer_id,
        event_type: row.event_type,
        school_id: row.school_id ?? null,
        location_id: row.location_id ?? null,
        color: row.color ?? null,
        is_all_day: Boolean(row.is_all_day),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "store_products",
      rows: rowsOf(sourceRowsByTable, "store_products").map((row) => ({
        id: row.id,
        school_id: row.school_id,
        name: row.name,
        description: row.description ?? null,
        price_cents: row.price_cents ?? 0,
        image_url: row.image_url ?? null,
        inventory_qty: row.inventory_qty ?? null,
        product_kind: row.product_kind ?? "owned",
        affiliate_url: row.affiliate_url ?? null,
        asin: row.asin ?? null,
        affiliate_metadata: row.affiliate_metadata ?? {},
        rsvp: row.rsvp ?? {},
        pickup_only: Boolean(row.pickup_only),
        is_active: row.is_active !== false,
        sort_order: row.sort_order ?? 0,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      })),
    },
    {
      table: "store_orders",
      rows: rowsOf(sourceRowsByTable, "store_orders").map((row) => {
        const parent = usersById.get(row.parent_id);
        return {
          id: row.id,
          school_id: row.school_id,
          parent_id: row.parent_id ?? null,
          parent_email: parent?.email ?? maskEmail("order", row.id),
          parent_name: parent?.name ?? "Masked Parent",
          status: row.status ?? "pending",
          total_cents: row.total_cents ?? 0,
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          access_token: `masked-${row.id}`,
          metadata: {},
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
        };
      }),
    },
    {
      table: "store_order_items",
      rows: rowsOf(sourceRowsByTable, "store_order_items").map((row) => ({
        id: row.id,
        store_order_id: row.store_order_id,
        listing_id: null,
        product_id: row.product_id ?? null,
        name: row.name,
        quantity: row.quantity ?? 1,
        unit_price_cents: row.unit_price_cents,
        line_total_cents: row.line_total_cents,
        metadata: row.metadata ?? {},
        created_at: row.created_at ?? null,
      })),
    },
    {
      table: "weekly_skeletons",
      rows: rowsOf(sourceRowsByTable, "weekly_skeletons").map((row) => ({ ...row })),
    },
    {
      table: "skeleton_blocks",
      rows: rowsOf(sourceRowsByTable, "skeleton_blocks").map((row) => ({ ...row })),
    },
    {
      table: "curriculum_assets",
      rows: rowsOf(sourceRowsByTable, "curriculum_assets").map((row) => ({ ...row })),
    },
    {
      table: "week_plans",
      rows: rowsOf(sourceRowsByTable, "week_plans").map((row) => ({ ...row })),
    },
    {
      table: "week_plan_blocks",
      rows: rowsOf(sourceRowsByTable, "week_plan_blocks").map((row) => ({ ...row })),
    },
  ];

  for (const entry of tables) {
    assertIdent(entry.table);
    if (!COPY_TABLES.includes(entry.table)) {
      throw new MaskRefused("not_allowlisted", `Refusing to write ${entry.table}`);
    }
  }

  return {
    tables,
    activeRoleUpdates: rowsOf(sourceRowsByTable, "users")
      .filter((row) => row.active_role_id != null)
      .map((row) => ({ id: row.id, active_role_id: row.active_role_id })),
  };
}
