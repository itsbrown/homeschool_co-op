import { z } from "zod";

/** One student row on school-code parent signup (`POST /api/auth/register`). */
export const registrationSignupChildSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  birthdate: z.string().trim().min(1).max(40),
  gradeLevel: z.string().trim().min(1).max(80),
  gender: z.string().trim().max(40).optional().nullable(),
});

export const registrationSignupChildrenSchema = z
  .array(registrationSignupChildSchema)
  .min(1)
  .max(10);

export type RegistrationSignupChildInput = z.infer<
  typeof registrationSignupChildSchema
>;

/** Loose inbound body — legacy `name` / `subscription` / alias name fields allowed. */
export const authRegisterBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).optional(),
    username: z.string().optional(),
    name: z.string().optional(),
    parentFirstName: z.string().optional(),
    parentLastName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    location: z.union([z.string(), z.number()]).optional().nullable(),
    role: z.string().optional(),
    schoolId: z.number().int().positive().nullable().optional(),
    registrationCode: z.string().nullable().optional(),
    children: z.unknown().optional(),
    /** Legacy client field — ignored by the server. */
    subscription: z.string().optional(),
  })
  .passthrough();

export type AuthRegisterBodyInput = z.infer<typeof authRegisterBodySchema>;

export type NormalizedAuthRegisterInput = {
  email: string;
  password: string | undefined;
  userFirstName: string;
  userLastName: string;
  phone: string;
  role: string;
  schoolId: number | null;
  registrationCode: string | null;
  preferredLocationId: number | null;
  signupChildren: RegistrationSignupChildInput[];
  requireChildWithSchoolSignup: boolean;
};

/** Prefer stored first/last; fall back to parsing users.name for legacy rows. */
export function resolveProfileNamesFromUser(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
}): { firstName: string; lastName: string; displayName: string } {
  let firstName = (user.firstName ?? "").trim();
  let lastName = (user.lastName ?? "").trim();
  if (!firstName && !lastName && user.name?.trim()) {
    const split = splitFullName(user.name);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  const displayName = `${firstName} ${lastName}`.trim() || user.email;
  return { firstName, lastName, displayName };
}

export function splitFullName(name: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function parseSignupChildren(raw: unknown): {
  ok: true;
  children: RegistrationSignupChildInput[];
} | { ok: false; message: string } {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    return { ok: true, children: [] };
  }
  const parsed = registrationSignupChildrenSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    return {
      ok: false,
      message: detail || "Invalid student information in registration request.",
    };
  }
  return { ok: true, children: parsed.data };
}

export function parsePreferredLocationId(
  location: string | number | null | undefined
): number | null {
  if (location === undefined || location === null || location === "") {
    return null;
  }
  const lid =
    typeof location === "string" ? parseInt(location, 10) : Number(location);
  return Number.isFinite(lid) && lid > 0 ? lid : null;
}

/**
 * Normalize `POST /api/auth/register` bodies from any supported client shape
 * (RegistrationLandingPage, legacy `registerUser`, docs examples).
 */
export function normalizeAuthRegisterInput(
  raw: unknown
):
  | { ok: true; data: NormalizedAuthRegisterInput }
  | { ok: false; message: string; status: 400 } {
  const parsed = authRegisterBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ?? "Invalid registration request.";
    return { ok: false, message: msg, status: 400 };
  }

  const body = parsed.data;
  let userFirstName = (body.parentFirstName || body.firstName || "").trim();
  let userLastName = (body.parentLastName || body.lastName || "").trim();

  if ((!userFirstName || !userLastName) && body.name?.trim()) {
    const split = splitFullName(body.name);
    userFirstName = userFirstName || split.firstName;
    userLastName = userLastName || split.lastName;
  }

  if (!userFirstName || !userLastName) {
    return {
      ok: false,
      message:
        "Email, first name, and last name are required (use parentFirstName/parentLastName, firstName/lastName, or name).",
      status: 400,
    };
  }

  const signupChildrenParse = parseSignupChildren(body.children);
  if (!signupChildrenParse.ok) {
    return { ok: false, message: signupChildrenParse.message, status: 400 };
  }

  const role = body.role || "parent";
  const schoolId = body.schoolId ?? null;
  const registrationCode = body.registrationCode ?? null;
  const requireChildWithSchoolSignup = Boolean(
    schoolId && registrationCode && role === "parent"
  );

  if (requireChildWithSchoolSignup && signupChildrenParse.children.length < 1) {
    return {
      ok: false,
      message: "Please add at least one student to finish registration.",
      status: 400,
    };
  }

  return {
    ok: true,
    data: {
      email: body.email,
      password: body.password,
      userFirstName,
      userLastName,
      phone: body.phone || "",
      role,
      schoolId,
      registrationCode,
      preferredLocationId: parsePreferredLocationId(body.location),
      signupChildren: signupChildrenParse.children,
      requireChildWithSchoolSignup,
    },
  };
}

/** Client payload for school-code parent signup (matches RegistrationLandingPage). */
export type RegisterParentWithChildrenPayload = {
  email: string;
  password: string;
  parentFirstName: string;
  parentLastName: string;
  phone: string;
  location: string | number;
  schoolId: number;
  registrationCode: string;
  children: RegistrationSignupChildInput[];
};

export function buildAuthRegisterRequestBody(
  payload: RegisterParentWithChildrenPayload
): Record<string, unknown> {
  const { parentFirstName, parentLastName, ...rest } = payload;
  return {
    ...rest,
    parentFirstName,
    parentLastName,
    firstName: parentFirstName,
    lastName: parentLastName,
    username: payload.email,
    name: `${parentFirstName} ${parentLastName}`.trim(),
    role: "parent" as const,
  };
}

/** Map legacy `registerUser` args to a valid register body. */
export function buildLegacyRegisterUserBody(userData: {
  username: string;
  email: string;
  password: string;
  name: string;
  role: string;
  subscription?: string;
}): Record<string, unknown> {
  const { firstName, lastName } = splitFullName(userData.name);
  return {
    email: userData.email,
    password: userData.password,
    username: userData.username || userData.email,
    name: userData.name,
    parentFirstName: firstName,
    parentLastName: lastName,
    firstName,
    lastName,
    role: userData.role,
    ...(userData.subscription ? { subscription: userData.subscription } : {}),
  };
}

export type AuthRegisterSuccessResponse = {
  success: true;
  message: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
  createdChildren: Array<{
    id: number;
    firstName: string;
    lastName: string;
  }>;
};
