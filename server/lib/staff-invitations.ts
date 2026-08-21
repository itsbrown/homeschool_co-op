import crypto from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { storage } from "../storage";
import {
  staffInvitations,
  userRoles,
  type StaffInvitation,
  type User,
} from "@shared/schema";
import {
  invitationExpiryDate,
  mapPositionToRole,
  staffInviteAbsoluteUrl,
} from "@shared/staff-invitations";
import { getActiveEducatorAssignmentForClass } from "./educator-class-assignments-db";
import { ensureStaffInvitationsSchema } from "./ensure-staff-invitations-schema";

export { mapPositionToRole };

export function generateInvitationToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function unusedLocalPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function staffInviteUrl(token: string): string {
  return staffInviteAbsoluteUrl(token, process.env.APP_URL);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getPendingStaffInvitationForEmail(
  schoolId: number,
  email: string,
): Promise<StaffInvitation | undefined> {
  await ensureStaffInvitationsSchema();
  const db = await getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(staffInvitations)
    .where(
      and(
        eq(staffInvitations.schoolId, schoolId),
        sql`lower(trim(${staffInvitations.email})) = ${normalizeEmail(email)}`,
        eq(staffInvitations.status, "pending"),
        gt(staffInvitations.expiresAt, now),
      ),
    )
    .limit(1);
  return row;
}

export async function getPendingStaffInvitationMapForSchool(
  schoolId: number,
): Promise<Map<string, boolean>> {
  await ensureStaffInvitationsSchema();
  const now = new Date();
  const rows = await storage.getStaffInvitationsBySchoolId(schoolId);
  const pendingMap = new Map<string, boolean>();
  for (const row of rows) {
    if (row.status !== "pending") continue;
    if (row.expiresAt && new Date(row.expiresAt) <= now) continue;
    pendingMap.set(row.email, true);
    pendingMap.set(normalizeEmail(row.email), true);
  }
  return pendingMap;
}

export async function getPendingStaffInvitationsByEmails(
  emails: string[],
): Promise<Map<string, boolean>> {
  const pendingMap = new Map<string, boolean>();
  if (emails.length === 0) return pendingMap;
  await ensureStaffInvitationsSchema();
  const now = new Date();
  const wanted = new Set(emails.map(normalizeEmail).filter(Boolean));
  for (const email of wanted) {
    const rows = await storage.getStaffInvitationsByEmail(email);
    const pending = rows.find(
      (row) =>
        row.status === "pending" &&
        (!row.expiresAt || new Date(row.expiresAt) > now),
    );
    if (pending) {
      pendingMap.set(email, true);
      pendingMap.set(pending.email, true);
    }
  }
  return pendingMap;
}

export async function createPendingStaffInvitation(input: {
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  schoolId: number;
  locationId: number | null;
  classId: number | null;
  message: string | null;
  invitedBy: number | null;
}): Promise<StaffInvitation> {
  await ensureStaffInvitationsSchema();
  const token = generateInvitationToken();
  return storage.createStaffInvitation({
    token,
    email: input.email.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: mapPositionToRole(input.position),
    position: input.position,
    invitedBy: input.invitedBy,
    schoolId: input.schoolId,
    locationId: input.locationId,
    classId: input.classId,
    message: input.message,
    status: "pending",
    expiresAt: invitationExpiryDate(),
  });
}

export async function refreshPendingStaffInvitation(
  invitation: StaffInvitation,
): Promise<StaffInvitation> {
  await ensureStaffInvitationsSchema();
  const updated = await storage.updateStaffInvitation(invitation.id, {
    expiresAt: invitationExpiryDate(),
    status: "pending",
  });
  return updated ?? invitation;
}

export async function assignInvitedEducatorToClass(params: {
  educatorId: number;
  classId: number;
  schoolId: number;
  instructorName: string;
}): Promise<void> {
  const classData = await storage.getClassById(params.classId);
  if (!classData || classData.schoolId !== params.schoolId) {
    throw new Error("Class not found at this school");
  }

  const existing = await getActiveEducatorAssignmentForClass(
    params.educatorId,
    params.classId,
  );
  if (!existing) {
    await storage.createEducatorClassAssignment({
      educatorId: params.educatorId,
      classId: params.classId,
      schoolId: params.schoolId,
      isPrimary: true,
      canStartSession: true,
    });
  }

  await storage.updateClass(params.classId, {
    instructorId: params.educatorId,
    instructorName: params.instructorName,
  } as Parameters<typeof storage.updateClass>[1]);
}

export async function loadInvitationWelcomeContext(invitation: StaffInvitation): Promise<{
  schoolName: string;
  className: string | null;
  campusName: string | null;
  position: string;
}> {
  const school = await storage.getSchool(invitation.schoolId);
  let className: string | null = null;
  let campusName: string | null = null;
  if (invitation.classId) {
    const cls = await storage.getClassById(invitation.classId);
    className = cls?.title ?? null;
  }
  if (invitation.locationId) {
    const loc = await storage.getLocationById(invitation.locationId);
    campusName = loc?.name ?? null;
  }
  return {
    schoolName: school?.name ?? "your school",
    className,
    campusName,
    position: invitation.position || invitation.role,
  };
}

type AcceptResult =
  | { ok: true; email: string; schoolName: string; position: string; className: string | null }
  | { ok: false; status: number; message: string };

async function findSupabaseUserIdByEmail(
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: (opts: { page: number; perPage: number }) => Promise<{
          data?: { users?: Array<{ id: string; email?: string | null }> };
          error?: { message?: string } | null;
        }>;
      };
    };
  },
  email: string,
): Promise<string | null> {
  for (let pageNum = 1; pageNum <= 10; pageNum++) {
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: pageNum,
      perPage: 200,
    });
    if (listErr || !listData?.users?.length) {
      break;
    }
    const match = listData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match.id;
    if (listData.users.length < 200) break;
  }
  return null;
}

export async function ensureSupabaseAuthUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}): Promise<{ supabaseUserId: string; created: boolean }> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Server configuration error - unable to create account");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      first_name: params.firstName,
      last_name: params.lastName,
      role: params.role,
    },
  });

  if (!createErr && created.user?.id) {
    return { supabaseUserId: created.user.id, created: true };
  }

  const msg = (createErr?.message || "").toLowerCase();
  const already =
    msg.includes("already") ||
    msg.includes("registered") ||
    (createErr as { code?: string } | null)?.code === "email_exists";
  if (!already) {
    throw new Error(createErr?.message || "Failed to create account");
  }

  const existingId = await findSupabaseUserIdByEmail(supabaseAdmin, params.email);
  if (!existingId) {
    throw new Error("Supabase reported existing user but the account could not be found");
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existingId, {
    password: params.password,
    email_confirm: true,
  });
  if (updateErr) {
    throw new Error(updateErr.message);
  }
  return { supabaseUserId: existingId, created: false };
}

export async function acceptStaffInvitation(params: {
  token: string;
  password: string;
}): Promise<AcceptResult> {
  await ensureStaffInvitationsSchema();
  const invitation = await storage.getStaffInvitationByToken(params.token);
  if (!invitation) {
    return { ok: false, status: 404, message: "Invalid or expired invitation" };
  }
  if (invitation.status !== "pending") {
    return {
      ok: false,
      status: 400,
      message: "This invitation has already been used. Ask your director to resend from Staff.",
    };
  }
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
    return {
      ok: false,
      status: 400,
      message: "This invitation has expired. Ask your director to resend from Staff.",
    };
  }

  const position = invitation.position || invitation.role;
  const welcome = await loadInvitationWelcomeContext(invitation);

  let supabaseUserId: string;
  try {
    const auth = await ensureSupabaseAuthUser({
      email: invitation.email,
      password: params.password,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      role: position,
    });
    supabaseUserId = auth.supabaseUserId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    if (message.includes("Server configuration")) {
      return { ok: false, status: 500, message };
    }
    return { ok: false, status: 400, message: `Failed to create account: ${message}` };
  }

  let localUser: User | undefined = await storage.getUserByEmail(invitation.email);
  if (!localUser) {
    localUser = await storage.createUser({
      email: invitation.email,
      username: invitation.email,
      password: unusedLocalPassword(),
      name: `${invitation.firstName} ${invitation.lastName}`.trim(),
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      phone: "",
      role: "teacher",
      schoolId: invitation.schoolId,
      supabaseId: supabaseUserId,
      isActive: true,
    });
  } else {
    await storage.updateUser(localUser.id, {
      supabaseId: supabaseUserId,
      schoolId: invitation.schoolId,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      name: `${invitation.firstName} ${invitation.lastName}`.trim(),
      isActive: true,
    });
    localUser = (await storage.getUser(localUser.id)) ?? localUser;
  }

  const db = await getDb();
  const existingRoles = await db
    .select()
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, localUser.id), eq(userRoles.schoolId, invitation.schoolId)),
    );
  const hasPosition = existingRoles.some(
    (r) => r.role.toLowerCase() === position.toLowerCase(),
  );
  if (!hasPosition) {
    await db.insert(userRoles).values({
      userId: localUser.id,
      role: position,
      schoolId: invitation.schoolId,
      isPrimary: existingRoles.length === 0,
    });
  }

  const schoolStaffRecords = await storage.getSchoolStaffBySchoolId(invitation.schoolId);
  const staffRecord = schoolStaffRecords.find((s) => s.userId === localUser!.id);
  if (staffRecord) {
    await storage.updateSchoolStaff(staffRecord.id, { isActive: true });
  } else {
    await storage.createSchoolStaff({
      schoolId: invitation.schoolId,
      userId: localUser.id,
      role: mapPositionToRole(position),
      position,
      department: position,
      startDate: new Date(),
      endDate: null,
      isActive: true,
      locationId: invitation.locationId,
    });
  }

  if (invitation.classId) {
    try {
      await assignInvitedEducatorToClass({
        educatorId: localUser.id,
        classId: invitation.classId,
        schoolId: invitation.schoolId,
        instructorName: `${invitation.firstName} ${invitation.lastName}`.trim(),
      });
    } catch (err) {
      console.error("Failed to assign class on invite accept:", err);
    }
  }

  await storage.updateStaffInvitation(invitation.id, { status: "accepted" });

  return {
    ok: true,
    email: invitation.email,
    schoolName: welcome.schoolName,
    position: welcome.position,
    className: welcome.className,
  };
}

export function parseOptionalClassId(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === "none" || raw === "later") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseOptionalLocationId(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === "none") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
