import type { APIRequestContext, APIResponse } from "@playwright/test";

const DEFAULT_TOKEN = "test-secret-token";

export function testApiToken(): string {
  return process.env.E2E_TEST_API_TOKEN?.trim() || DEFAULT_TOKEN;
}

export type SetupCartScenarioResponse = {
  success: boolean;
  data?: {
    supabaseLinked?: boolean;
    adminSupabaseLinked?: boolean;
    parent: { email: string; password: string; id: number };
    admin?: { email: string; password: string; id: number };
    enrollment: {
      id: number;
      status?: string;
      totalCost?: number;
      paymentPlan?: string;
      remainingBalance?: number;
    };
    child: { id: number; firstName: string; lastName: string };
    class?: { id: number; title: string; price: number };
    school?: {
      id: number;
      name: string;
      registrationCode: string;
      membershipFeeAmountCents?: number;
      membershipRequired?: boolean;
    };
    credit?: { id: number; amountCents: number; status: string } | null;
    membership?: {
      id: number;
      status: string;
      membershipYear: number;
      totalAmount: number;
    } | null;
  };
  error?: string;
  details?: string;
};

export async function postSetupCartScenario(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ response: APIResponse; json: SetupCartScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-cart-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: SetupCartScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupCartScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export type SetupSessionEnrollmentScenarioResponse = {
  success: boolean;
  data?: {
    supabaseLinked?: boolean;
    school: { id: number; name: string; registrationCode: string };
    parent: { id: number; email: string; password: string };
    child: { id: number; firstName: string; lastName: string };
    openSessions: { id: number; name: string; enrollmentOpen: boolean }[];
    closedSession: { id: number; name: string; enrollmentOpen: boolean } | null;
  };
  error?: string;
  details?: string;
};

export type SetupRegistrationScenarioResponse = {
  success: boolean;
  data?: {
    registrationCode: string;
    openSessions?: { id: number; name: string; enrollmentOpen: boolean }[];
    school: { id: number; name: string; registrationCode: string };
    wrongSchool: { id: number; name: string };
    admin: {
      id: number;
      email: string;
      password: string;
      usersSchoolId: number;
    };
    locationsOnSchool: { id: number; name: string; schoolId: number }[];
    locationOnWrongSchool: { id: number; name: string; schoolId: number };
  };
  error?: string;
  details?: string;
};

export async function postSetupRegistrationScenario(
  request: APIRequestContext,
  body: { openSessionCount?: number } = {},
): Promise<{ response: APIResponse; json: SetupRegistrationScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-registration-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: SetupRegistrationScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupRegistrationScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export type SetupCreditLookupScenarioResponse = {
  success: boolean;
  data?: {
    adminSupabaseLinked?: boolean;
    school: { id: number; name: string; registrationCode: string };
    admin: { id: number; email: string; password: string };
    legacyParent: { id: number; email: string; name: string };
    roleLinkedParent: { id: number; email: string; name: string };
  };
  error?: string;
  details?: string;
};

export async function postSetupCreditLookupScenario(
  request: APIRequestContext,
  body: { linkSupabaseAuthAdmin?: boolean } = {},
): Promise<{ response: APIResponse; json: SetupCreditLookupScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-credit-lookup-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: SetupCreditLookupScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupCreditLookupScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export async function postSetupSessionEnrollmentScenario(
  request: APIRequestContext,
  body: {
    openSessionCount?: number;
    includeClosedSession?: boolean;
    linkSupabaseAuth?: boolean;
  } = {},
): Promise<{ response: APIResponse; json: SetupSessionEnrollmentScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-session-enrollment-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: SetupSessionEnrollmentScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupSessionEnrollmentScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export type SetupPublicFormScenarioResponse = {
  success: boolean;
  data?: {
    school: { id: number; name: string };
    publicForm: {
      id: number;
      slug: string;
      title: string;
      fieldIds: { fullName: number; email: number; resume: number; agree: number };
    };
    membersForm: { id: number; slug: string };
  };
  error?: string;
  details?: string;
};

export async function postSetupPublicFormScenario(
  request: APIRequestContext,
): Promise<{ response: APIResponse; json: SetupPublicFormScenarioResponse | null }> {
  const response = await request.post("/api/test/setup-public-form-scenario", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: {},
  });
  let json: SetupPublicFormScenarioResponse | null = null;
  try {
    json = (await response.json()) as SetupPublicFormScenarioResponse;
  } catch {
    json = null;
  }
  return { response, json };
}

export async function postSeedUpcomingScheduledPayment(
  request: APIRequestContext,
  body: { enrollmentId: number; amountCents?: number; paymentPlan?: string },
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await request.post("/api/test/seed-upcoming-scheduled-payment", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  const text = await response.text();
  return { ok: response.ok(), status: response.status(), text };
}
