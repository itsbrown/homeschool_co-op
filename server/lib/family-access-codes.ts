import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { storage } from "../storage";
import {
  auditLogs,
  familyAccessCodes,
  schools,
  users,
  type FamilyAccessCode,
  type InsertAuditLog,
} from "../../shared/schema";
import { isSchoolFeatureEnabled, normalizeSchoolFeatures } from "./school-features";
import { normalizeEmailForLookup } from "@shared/parent-identity";
import {
  accessCodeLast4,
  parseFamilyAccessCsvText,
  type FamilyAccessCsvColumnMapping,
  type ParsedFamilyAccessCsvRow,
} from "@shared/family-access-code-csv";

export class FamilyAccessCodeError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "FamilyAccessCodeError";
  }
}

export const ACCESS_CODE_PATTERN = /^[A-Za-z0-9]{3,12}$/;

export function normalizeAccessCode(raw: string): string {
  return raw.trim();
}

export function validateAccessCode(raw: string): string {
  const code = normalizeAccessCode(raw);
  if (!ACCESS_CODE_PATTERN.test(code)) {
    throw new FamilyAccessCodeError(
      "Door code must be 3–12 letters or numbers",
      400,
      "INVALID_CODE",
    );
  }
  return code;
}

export function last4OfCode(code: string): string {
  return accessCodeLast4(code);
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new FamilyAccessCodeError("Database unavailable", 503, "DB_UNAVAILABLE");
  }
  return db;
}

export async function isDoorCodesFeatureEnabled(schoolId: number): Promise<boolean> {
  const db = await requireDb();
  const rows = await db
    .select({ enabledFeatures: schools.enabledFeatures })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1);
  return isSchoolFeatureEnabled(normalizeSchoolFeatures(rows[0]?.enabledFeatures), "doorCodes");
}

export async function assertDoorCodesEnabledForLocation(
  schoolId: number,
  locationId: number,
): Promise<{ location: NonNullable<Awaited<ReturnType<typeof storage.getLocationById>>> }> {
  const enabled = await isDoorCodesFeatureEnabled(schoolId);
  if (!enabled) {
    throw new FamilyAccessCodeError(
      "Door codes are not enabled for this school",
      400,
      "FEATURE_DISABLED",
    );
  }
  const location = await storage.getLocationById(locationId);
  if (!location || location.schoolId !== schoolId) {
    throw new FamilyAccessCodeError("Campus not found", 404, "LOCATION_NOT_FOUND");
  }
  if (!location.doorCodesEnabled) {
    throw new FamilyAccessCodeError(
      "This campus does not use family door codes",
      400,
      "CAMPUS_DISABLED",
    );
  }
  return { location };
}

export async function getActiveCodeForParentAtLocation(
  parentId: number,
  locationId: number,
): Promise<FamilyAccessCode | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(familyAccessCodes)
    .where(
      and(
        eq(familyAccessCodes.parentId, parentId),
        eq(familyAccessCodes.locationId, locationId),
        eq(familyAccessCodes.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type ParentAccessCodeView = {
  enabled: boolean;
  locationId: number | null;
  locationName: string | null;
  code: string | null;
};

export async function getParentAccessCodeView(parentId: number): Promise<ParentAccessCodeView> {
  const parent = await storage.getUser(parentId);
  if (!parent) {
    throw new FamilyAccessCodeError("Parent not found", 404, "PARENT_NOT_FOUND");
  }
  const schoolId = parent.schoolId ?? null;
  const locationId = parent.locationId ?? null;
  if (schoolId == null || locationId == null) {
    return { enabled: false, locationId, locationName: null, code: null };
  }

  const location = await storage.getLocationById(locationId);
  const locationName = location?.name ?? null;
  const schoolOn = await isDoorCodesFeatureEnabled(schoolId);
  const campusOn = location?.schoolId === schoolId && location.doorCodesEnabled === true;
  const enabled = schoolOn && campusOn;
  if (!enabled) {
    return { enabled: false, locationId, locationName, code: null };
  }

  const row = await getActiveCodeForParentAtLocation(parentId, locationId);
  return {
    enabled: true,
    locationId,
    locationName,
    code: row?.code ?? null,
  };
}

export async function listActiveCodesForLocation(
  schoolId: number,
  locationId: number,
): Promise<Array<{
  id: number;
  parentId: number;
  parentEmail: string;
  parentName: string;
  code: string;
  assignedAt: Date;
}>> {
  await assertDoorCodesEnabledForLocation(schoolId, locationId);
  const db = await requireDb();
  const rows = await db
    .select({
      id: familyAccessCodes.id,
      parentId: familyAccessCodes.parentId,
      code: familyAccessCodes.code,
      assignedAt: familyAccessCodes.assignedAt,
      parentEmail: users.email,
      parentName: users.name,
    })
    .from(familyAccessCodes)
    .innerJoin(users, eq(users.id, familyAccessCodes.parentId))
    .where(
      and(
        eq(familyAccessCodes.schoolId, schoolId),
        eq(familyAccessCodes.locationId, locationId),
        eq(familyAccessCodes.status, "active"),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    parentEmail: r.parentEmail,
    parentName: r.parentName,
    code: r.code,
    assignedAt: r.assignedAt,
  }));
}

async function writeAudit(args: {
  actionType: "door_code_assign" | "door_code_revoke";
  actorId: number | null;
  actorEmail: string | null;
  actorRole: string | null;
  schoolId: number;
  parentId: number;
  locationId: number;
  last4: string;
}) {
  try {
    const db = await requireDb();
    const log: InsertAuditLog = {
      actionType: args.actionType,
      severity: "info",
      actorId: args.actorId,
      actorEmail: args.actorEmail,
      actorRole: args.actorRole,
      targetType: "family_access_code",
      targetId: String(args.parentId),
      schoolId: args.schoolId,
      metadata: {
        parentId: args.parentId,
        locationId: args.locationId,
        last4: args.last4,
      },
    };
    await db.insert(auditLogs).values(log);
  } catch (err) {
    console.warn("[family-access-codes] audit log failed:", err);
  }
}

export async function revokeActiveForParent(args: {
  parentId: number;
  schoolId: number;
  locationId?: number | null;
  actorId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}): Promise<{ revoked: number }> {
  const db = await requireDb();
  const conditions = [
    eq(familyAccessCodes.parentId, args.parentId),
    eq(familyAccessCodes.schoolId, args.schoolId),
    eq(familyAccessCodes.status, "active"),
  ];
  if (args.locationId != null) {
    conditions.push(eq(familyAccessCodes.locationId, args.locationId));
  }

  const existing = await db
    .select()
    .from(familyAccessCodes)
    .where(and(...conditions));

  if (existing.length === 0) return { revoked: 0 };

  await db
    .update(familyAccessCodes)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions));

  for (const row of existing) {
    await writeAudit({
      actionType: "door_code_revoke",
      actorId: args.actorId ?? null,
      actorEmail: args.actorEmail ?? null,
      actorRole: args.actorRole ?? null,
      schoolId: args.schoolId,
      parentId: args.parentId,
      locationId: row.locationId,
      last4: last4OfCode(row.code),
    });
  }

  return { revoked: existing.length };
}

export async function upsertParentAccessCode(args: {
  schoolId: number;
  parentId: number;
  code: string;
  assignedBy: number;
  actorEmail?: string | null;
  actorRole?: string | null;
}): Promise<FamilyAccessCode> {
  const parent = await storage.getUser(args.parentId);
  if (!parent || parent.schoolId !== args.schoolId) {
    throw new FamilyAccessCodeError("Parent not found in this school", 404, "PARENT_NOT_FOUND");
  }
  const locationId = parent.locationId;
  if (locationId == null) {
    throw new FamilyAccessCodeError(
      "Set the family campus before assigning a door code",
      400,
      "NO_CAMPUS",
    );
  }
  await assertDoorCodesEnabledForLocation(args.schoolId, locationId);
  const code = validateAccessCode(args.code);

  const collision = await getActiveByCode(args.schoolId, locationId, code);
  if (collision && collision.parentId !== args.parentId) {
    throw new FamilyAccessCodeError(
      "That door code is already assigned to another family at this campus",
      409,
      "CODE_IN_USE",
    );
  }

  const existing = await getActiveCodeForParentAtLocation(args.parentId, locationId);
  const db = await requireDb();

  if (existing && existing.code === code) {
    return existing;
  }

  if (existing) {
    await db
      .update(familyAccessCodes)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(familyAccessCodes.id, existing.id));
  }

  const inserted = await db
    .insert(familyAccessCodes)
    .values({
      schoolId: args.schoolId,
      locationId,
      parentId: args.parentId,
      code,
      status: "active",
      assignedBy: args.assignedBy,
      assignedAt: new Date(),
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new FamilyAccessCodeError("Failed to save door code", 500, "INSERT_FAILED");
  }

  await writeAudit({
    actionType: "door_code_assign",
    actorId: args.assignedBy,
    actorEmail: args.actorEmail ?? null,
    actorRole: args.actorRole ?? null,
    schoolId: args.schoolId,
    parentId: args.parentId,
    locationId,
    last4: last4OfCode(code),
  });

  return row;
}

async function getActiveByCode(
  schoolId: number,
  locationId: number,
  code: string,
): Promise<FamilyAccessCode | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(familyAccessCodes)
    .where(
      and(
        eq(familyAccessCodes.schoolId, schoolId),
        eq(familyAccessCodes.locationId, locationId),
        eq(familyAccessCodes.code, code),
        eq(familyAccessCodes.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type AccessCodeImportPreviewRow = {
  row: number;
  email: string;
  code: string;
  status: "ok" | "error";
  message?: string;
  parentId?: number;
  locationId?: number;
};

export type AccessCodeImportResult = {
  dryRun: boolean;
  assigned: number;
  errors: number;
  preview: AccessCodeImportPreviewRow[];
};

function resolveLocationForImport(args: {
  locations: Array<{ id: number; name: string; code: string; schoolId: number; doorCodesEnabled: boolean }>;
  schoolId: number;
  defaultLocationId: number | null;
  csvLocation: string | null;
}): { locationId: number } | { error: string } {
  if (args.csvLocation) {
    const needle = args.csvLocation.trim().toLowerCase();
    const match = args.locations.find(
      (l) =>
        l.schoolId === args.schoolId &&
        (l.name.toLowerCase() === needle || l.code.toLowerCase() === needle),
    );
    if (!match) return { error: `Unknown campus "${args.csvLocation}"` };
    return { locationId: match.id };
  }
  if (args.defaultLocationId != null) return { locationId: args.defaultLocationId };
  return { error: "No campus specified" };
}

export async function importFamilyAccessCodes(args: {
  schoolId: number;
  csv: string;
  locationId?: number | null;
  dryRun: boolean;
  assignedBy: number;
  actorEmail?: string | null;
  actorRole?: string | null;
  mapping?: FamilyAccessCsvColumnMapping | null;
}): Promise<AccessCodeImportResult> {
  const parsed = parseFamilyAccessCsvText(args.csv, args.mapping);
  const preview: AccessCodeImportPreviewRow[] = parsed.errors.map((e) => ({
    row: e.row,
    email: "",
    code: "",
    status: "error" as const,
    message: e.message,
  }));

  const schoolLocations = await storage.getLocationsBySchoolId(args.schoolId);
  const db = await requireDb();
  const parents = await db
    .select({
      id: users.id,
      email: users.email,
      schoolId: users.schoolId,
      locationId: users.locationId,
    })
    .from(users)
    .where(eq(users.schoolId, args.schoolId));

  const emailIndex = new Map<string, (typeof parents)[number]>();
  for (const p of parents) {
    emailIndex.set(normalizeEmailForLookup(p.email), p);
  }

  const pending: Array<ParsedFamilyAccessCsvRow & { parentId: number; locationId: number; code: string }> = [];

  for (const row of parsed.rows) {
    const loc = resolveLocationForImport({
      locations: schoolLocations,
      schoolId: args.schoolId,
      defaultLocationId: args.locationId ?? null,
      csvLocation: row.location,
    });
    if ("error" in loc) {
      preview.push({
        row: row.sourceRow,
        email: row.email,
        code: row.code,
        status: "error",
        message: loc.error,
      });
      continue;
    }

    try {
      await assertDoorCodesEnabledForLocation(args.schoolId, loc.locationId);
      const code = validateAccessCode(row.code);
      const parent = emailIndex.get(normalizeEmailForLookup(row.email));
      if (!parent) {
        preview.push({
          row: row.sourceRow,
          email: row.email,
          code,
          status: "error",
          message: "No parent with that email in this school",
        });
        continue;
      }
      if (parent.locationId !== loc.locationId) {
        preview.push({
          row: row.sourceRow,
          email: row.email,
          code,
          status: "error",
          message: "Parent campus does not match this location",
        });
        continue;
      }
      pending.push({ ...row, parentId: parent.id, locationId: loc.locationId, code });
      preview.push({
        row: row.sourceRow,
        email: row.email,
        code,
        status: "ok",
        parentId: parent.id,
        locationId: loc.locationId,
      });
    } catch (err) {
      const message = err instanceof FamilyAccessCodeError ? err.message : "Invalid row";
      preview.push({
        row: row.sourceRow,
        email: row.email,
        code: row.code,
        status: "error",
        message,
      });
    }
  }

  const codesByLocation = new Map<number, Map<string, number>>();
  for (const row of pending) {
    let map = codesByLocation.get(row.locationId);
    if (!map) {
      map = new Map();
      codesByLocation.set(row.locationId, map);
    }
    const prior = map.get(row.code);
    if (prior != null) {
      const item = preview.find((p) => p.row === row.sourceRow);
      if (item) {
        item.status = "error";
        item.message = `Duplicate door code in file (also row ${prior})`;
      }
    } else {
      map.set(row.code, row.sourceRow);
    }
  }

  const okPreview = preview.filter((p) => p.status === "ok");
  if (args.dryRun) {
    return {
      dryRun: true,
      assigned: 0,
      errors: preview.filter((p) => p.status === "error").length,
      preview,
    };
  }

  let assigned = 0;
  for (const row of pending) {
    const item = preview.find((p) => p.row === row.sourceRow);
    if (!item || item.status !== "ok") continue;
    try {
      await upsertParentAccessCode({
        schoolId: args.schoolId,
        parentId: row.parentId,
        code: row.code,
        assignedBy: args.assignedBy,
        actorEmail: args.actorEmail,
        actorRole: args.actorRole,
      });
      assigned += 1;
    } catch (err) {
      item.status = "error";
      item.message = err instanceof FamilyAccessCodeError ? err.message : "Failed to assign";
    }
  }

  return {
    dryRun: false,
    assigned,
    errors: preview.filter((p) => p.status === "error").length,
    preview,
  };
}

export { normalizeSchoolFeatures };
