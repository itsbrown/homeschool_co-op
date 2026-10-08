import { getRawPg } from './pg-raw';
import { getStripeClient, getStripeSecretKey } from '../config/stripe';
import {
  FamilyPaymentsGatedError,
  PlanLimitError,
  PLATFORM_PLANS,
  planDefinition,
  planIdForStripePrice,
  publicPlanCatalog,
  stripePriceIdForPlan,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
  isPlatformPlanId,
} from '../config/platform-plans';

export type SchoolPlatformRecord = {
  plan: PlatformPlanId;
  status: PlatformSubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  brandColor: string | null;
  setupCompletedAt: Date | null;
  columnMissing: boolean;
};

const FAMILY_PAYMENTS_MESSAGE =
  'Parent card payments are turned off for this school until payouts are connected. Families are not charged on the platform Stripe account. Upgrade or billing questions are on the school billing page.';

function isMissingColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('42703') || message.includes('platform_plan') || message.includes('does not exist');
}

export async function readSchoolPlatform(schoolId: number): Promise<SchoolPlatformRecord> {
  const fallback: SchoolPlatformRecord = {
    plan: 'internal',
    status: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    brandColor: null,
    setupCompletedAt: null,
    columnMissing: true,
  };
  try {
    const pg = getRawPg();
    const rows = await pg.unsafe(
      `SELECT platform_plan, platform_subscription_status, platform_stripe_customer_id,
              platform_stripe_subscription_id, brand_color, setup_completed_at
       FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return { ...fallback, columnMissing: false };
    const plan = isPlatformPlanId(row.platform_plan) ? row.platform_plan : 'internal';
    const rawStatus = String(row.platform_subscription_status ?? 'active');
    const status: PlatformSubscriptionStatus =
      rawStatus === 'past_due' || rawStatus === 'canceled' || rawStatus === 'incomplete'
        ? rawStatus
        : 'active';
    return {
      plan,
      status,
      stripeCustomerId: row.platform_stripe_customer_id != null ? String(row.platform_stripe_customer_id) : null,
      stripeSubscriptionId:
        row.platform_stripe_subscription_id != null ? String(row.platform_stripe_subscription_id) : null,
      brandColor: row.brand_color != null ? String(row.brand_color) : null,
      setupCompletedAt: row.setup_completed_at != null ? new Date(row.setup_completed_at as string) : null,
      columnMissing: false,
    };
  } catch (error) {
    if (isMissingColumn(error)) return fallback;
    throw error;
  }
}

export async function writeSchoolPlatform(
  schoolId: number,
  patch: Partial<{
    plan: PlatformPlanId;
    status: PlatformSubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    brandColor: string | null;
    setupCompletedAt: Date | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.plan) add('platform_plan', patch.plan);
  if (patch.status) add('platform_subscription_status', patch.status);
  if (patch.stripeCustomerId !== undefined) add('platform_stripe_customer_id', patch.stripeCustomerId);
  if (patch.stripeSubscriptionId !== undefined) {
    add('platform_stripe_subscription_id', patch.stripeSubscriptionId);
  }
  if (patch.brandColor !== undefined) add('brand_color', patch.brandColor);
  if (patch.setupCompletedAt !== undefined) add('setup_completed_at', patch.setupCompletedAt);
  if (sets.length === 0) return;
  values.push(schoolId);
  sets.push('updated_at = NOW()');
  const pg = getRawPg();
  await pg.unsafe(`UPDATE schools SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
}

export async function countSchoolCampuses(schoolId: number): Promise<number> {
  const pg = getRawPg();
  const rows = await pg.unsafe(`SELECT COUNT(*)::int AS n FROM locations WHERE school_id = $1`, [schoolId]);
  return Number((rows[0] as { n: number }).n ?? 0);
}

export async function countSchoolStudents(schoolId: number): Promise<number> {
  const pg = getRawPg();
  const rows = await pg.unsafe(`SELECT COUNT(*)::int AS n FROM children WHERE school_id = $1`, [schoolId]);
  return Number((rows[0] as { n: number }).n ?? 0);
}

export async function assertCampusCapacity(schoolId: number): Promise<void> {
  const record = await readSchoolPlatform(schoolId);
  const max = planDefinition(record.plan).maxCampuses;
  if (max == null) return;
  const current = await countSchoolCampuses(schoolId);
  if (current >= max) {
    throw new PlanLimitError(
      `${planDefinition(record.plan).name} includes ${max} campus${max === 1 ? '' : 'es'}. Upgrade the platform plan to add another.`,
    );
  }
}

export async function assertStudentCapacity(schoolId: number | null | undefined): Promise<void> {
  if (schoolId == null || !Number.isFinite(schoolId)) return;
  const record = await readSchoolPlatform(schoolId);
  const max = planDefinition(record.plan).maxStudents;
  if (max == null) return;
  const current = await countSchoolStudents(schoolId);
  if (current >= max) {
    throw new PlanLimitError(
      `${planDefinition(record.plan).name} includes ${max} students. Upgrade the platform plan to add another.`,
    );
  }
}

/** ASA (`internal`) and a missing column always allow charges. Other plans do not. */
export async function familyChargeDecision(schoolId: number | null | undefined): Promise<{
  allowed: boolean;
  message?: string;
}> {
  if (schoolId == null || !Number.isFinite(Number(schoolId))) {
    return { allowed: true };
  }
  const record = await readSchoolPlatform(Number(schoolId));
  if (record.columnMissing || record.plan === 'internal' || planDefinition(record.plan).familyPayments) {
    return { allowed: true };
  }
  return { allowed: false, message: FAMILY_PAYMENTS_MESSAGE };
}

export async function assertFamilyChargesAllowed(schoolId: number | null | undefined): Promise<void> {
  const decision = await familyChargeDecision(schoolId);
  if (!decision.allowed) {
    throw new FamilyPaymentsGatedError(decision.message || FAMILY_PAYMENTS_MESSAGE);
  }
}

export function assertPlatformCheckoutTestMode(secretKey: string): void {
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
    throw new Error(
      'Platform school billing in this release accepts Stripe test keys only. Set a test secret and test Price ids.',
    );
  }
}

export async function findSchoolIdByPlatformCustomer(customerId: string): Promise<number | null> {
  try {
    const pg = getRawPg();
    const rows = await pg.unsafe(
      `SELECT id FROM schools WHERE platform_stripe_customer_id = $1 LIMIT 1`,
      [customerId],
    );
    const row = rows[0] as { id: number } | undefined;
    return row ? Number(row.id) : null;
  } catch (error) {
    if (isMissingColumn(error)) return null;
    throw error;
  }
}

export async function findSchoolIdByPlatformSubscription(subscriptionId: string): Promise<number | null> {
  try {
    const pg = getRawPg();
    const rows = await pg.unsafe(
      `SELECT id FROM schools WHERE platform_stripe_subscription_id = $1 LIMIT 1`,
      [subscriptionId],
    );
    const row = rows[0] as { id: number } | undefined;
    return row ? Number(row.id) : null;
  } catch (error) {
    if (isMissingColumn(error)) return null;
    throw error;
  }
}

function mapStripeStatus(status: string): PlatformSubscriptionStatus {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'incomplete';
}

export async function applyPlatformCheckoutSession(session: {
  metadata?: Record<string, string> | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  mode?: string | null;
}): Promise<boolean> {
  if (session.metadata?.type !== 'platform_subscription') return false;
  const schoolId = Number(session.metadata.schoolId);
  const planId = session.metadata.planId;
  if (!Number.isFinite(schoolId) || !isPlatformPlanId(planId) || planId === 'internal') {
    console.error('Platform checkout session missing school or plan', session.metadata);
    return true;
  }
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  await writeSchoolPlatform(schoolId, {
    plan: planId,
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  return true;
}

export async function applyPlatformSubscriptionObject(subscription: {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata?: Record<string, string> | null;
  items?: { data: Array<{ price?: { id?: string } | null }> };
}): Promise<boolean> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  let schoolId = Number(subscription.metadata?.schoolId);
  if (!Number.isFinite(schoolId) || schoolId <= 0) {
    schoolId = (await findSchoolIdByPlatformCustomer(customerId)) ?? 0;
  }
  if (!schoolId) {
    schoolId = (await findSchoolIdByPlatformSubscription(subscription.id)) ?? 0;
  }
  if (!schoolId) return false;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planFromPrice = planIdForStripePrice(priceId);
  const planFromMeta = subscription.metadata?.planId;
  const plan = isPlatformPlanId(planFromMeta) && planFromMeta !== 'internal'
    ? planFromMeta
    : planFromPrice;
  await writeSchoolPlatform(schoolId, {
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    ...(plan ? { plan } : {}),
  });
  return true;
}

export async function billingSnapshot(schoolId: number) {
  const record = await readSchoolPlatform(schoolId);
  const plan = planDefinition(record.plan);
  const [campuses, students] = await Promise.all([
    countSchoolCampuses(schoolId).catch(() => 0),
    countSchoolStudents(schoolId).catch(() => 0),
  ]);
  return {
    plan: record.plan,
    planName: plan.name,
    status: record.status,
    familyPayments: plan.familyPayments && record.plan === 'internal',
    limits: {
      maxCampuses: plan.maxCampuses,
      maxStudents: plan.maxStudents,
      campuses,
      students,
    },
    stripeCustomerId: record.stripeCustomerId,
    portalAvailable: Boolean(record.stripeCustomerId),
    setupCompletedAt: record.setupCompletedAt,
    brandColor: record.brandColor,
    catalog: publicPlanCatalog(),
    familyPaymentsMessage: plan.familyPayments ? null : FAMILY_PAYMENTS_MESSAGE,
  };
}

export async function createPlatformCheckout(params: {
  schoolId: number;
  schoolName: string;
  adminEmail: string;
  planId: PlatformPlanId;
  origin: string;
}): Promise<{ sessionUrl: string }> {
  const plan = PLATFORM_PLANS[params.planId];
  if (!plan?.purchasable) {
    throw new Error('That plan cannot be purchased');
  }
  const priceId = stripePriceIdForPlan(params.planId);
  if (!priceId) {
    throw new Error(
      `Stripe Price id is not configured. Set ${plan.priceEnv} to a test-mode Price id.`,
    );
  }
  const secret = await getStripeSecretKey();
  assertPlatformCheckoutTestMode(secret);
  const stripe = await getStripeClient();
  const current = await readSchoolPlatform(params.schoolId);
  let customerId = current.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: params.adminEmail,
      name: params.schoolName,
      metadata: {
        schoolId: String(params.schoolId),
        purpose: 'platform_subscription',
      },
    });
    customerId = customer.id;
    await writeSchoolPlatform(params.schoolId, { stripeCustomerId: customerId });
  }
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${params.origin}/schools/billing?checkout=success`,
    cancel_url: `${params.origin}/schools/billing?checkout=cancel`,
    metadata: {
      type: 'platform_subscription',
      schoolId: String(params.schoolId),
      planId: params.planId,
    },
    subscription_data: {
      metadata: {
        type: 'platform_subscription',
        schoolId: String(params.schoolId),
        planId: params.planId,
      },
    },
  });
  if (!session.url) throw new Error('Stripe did not return a Checkout URL');
  return { sessionUrl: session.url };
}

export async function createPlatformPortal(schoolId: number, origin: string): Promise<{ url: string }> {
  const current = await readSchoolPlatform(schoolId);
  if (!current.stripeCustomerId) {
    throw new Error('This school does not have a Stripe customer yet. Choose a plan first.');
  }
  const secret = await getStripeSecretKey();
  assertPlatformCheckoutTestMode(secret);
  const stripe = await getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: current.stripeCustomerId,
    return_url: `${origin}/schools/billing`,
  });
  return { url: session.url };
}

export { FAMILY_PAYMENTS_MESSAGE };
