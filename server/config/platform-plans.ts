/**
 * Platform (SaaS) plans sold to schools. Stripe Price ids come from env.
 * This release creates Checkout only with test-mode secret keys.
 * ASA stays on `internal` (unlimited, not for sale).
 */

export type PlatformPlanId = 'internal' | 'starter' | 'growth' | 'school';
export type PlatformSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';

export type PlatformPlanDefinition = {
  id: PlatformPlanId;
  name: string;
  description: string;
  /** Display dollars per month. Checkout uses the Stripe Price, not this number. */
  monthlyUsd: number;
  purchasable: boolean;
  /** Null means no cap. */
  maxCampuses: number | null;
  maxStudents: number | null;
  /** Parent tuition / store card charges. False until Stripe Connect exists. */
  familyPayments: boolean;
  priceEnv: string | null;
};

export const PLATFORM_PLANS: Record<PlatformPlanId, PlatformPlanDefinition> = {
  internal: {
    id: 'internal',
    name: 'ASA internal',
    description: 'Unlimited plan for the operating school. Not sold.',
    monthlyUsd: 0,
    purchasable: false,
    maxCampuses: null,
    maxStudents: null,
    familyPayments: true,
    priceEnv: null,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'One campus and a small student roster. Parent card payments stay off.',
    monthlyUsd: 49,
    purchasable: true,
    maxCampuses: 1,
    maxStudents: 40,
    familyPayments: false,
    priceEnv: 'STRIPE_PRICE_PLATFORM_STARTER',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'A few campuses and a larger roster. Parent card payments stay off.',
    monthlyUsd: 149,
    purchasable: true,
    maxCampuses: 3,
    maxStudents: 200,
    familyPayments: false,
    priceEnv: 'STRIPE_PRICE_PLATFORM_GROWTH',
  },
  school: {
    id: 'school',
    name: 'School',
    description: 'No campus or student cap. Parent card payments stay off until payouts exist.',
    monthlyUsd: 299,
    purchasable: true,
    maxCampuses: null,
    maxStudents: null,
    familyPayments: false,
    priceEnv: 'STRIPE_PRICE_PLATFORM_SCHOOL',
  },
};

export const PURCHASABLE_PLAN_IDS: PlatformPlanId[] = ['starter', 'growth', 'school'];

export function isPlatformPlanId(value: unknown): value is PlatformPlanId {
  return value === 'internal' || value === 'starter' || value === 'growth' || value === 'school';
}

export function planDefinition(planId: string | null | undefined): PlatformPlanDefinition {
  if (isPlatformPlanId(planId)) return PLATFORM_PLANS[planId];
  return PLATFORM_PLANS.internal;
}

export function stripePriceIdForPlan(planId: PlatformPlanId): string | null {
  const envName = PLATFORM_PLANS[planId].priceEnv;
  if (!envName) return null;
  const value = process.env[envName]?.trim();
  return value || null;
}

export function planIdForStripePrice(priceId: string | null | undefined): PlatformPlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLATFORM_PLANS)) {
    if (plan.priceEnv && process.env[plan.priceEnv]?.trim() === priceId) {
      return plan.id;
    }
  }
  return null;
}

export function publicPlanCatalog() {
  return PURCHASABLE_PLAN_IDS.map((id) => {
    const plan = PLATFORM_PLANS[id];
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyUsd: plan.monthlyUsd,
      maxCampuses: plan.maxCampuses,
      maxStudents: plan.maxStudents,
      familyPayments: plan.familyPayments,
      purchasable: plan.purchasable,
      priceConfigured: Boolean(stripePriceIdForPlan(id)),
    };
  });
}

export class PlanLimitError extends Error {
  code = 'PLAN_LIMIT';
  upgradePath = '/schools/billing';
  constructor(message: string) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

export class FamilyPaymentsGatedError extends Error {
  code = 'FAMILY_PAYMENTS_GATED';
  upgradePath = '/schools/billing';
  constructor(message: string) {
    super(message);
    this.name = 'FamilyPaymentsGatedError';
  }
}
