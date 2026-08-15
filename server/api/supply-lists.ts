import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { UploadedFile } from "express-fileupload";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { storage } from "../storage";
import {
  getChildrenForAuthenticatedParent,
  parentAuthCriteriaFromRequest,
  resolveParentDbUser,
} from "../lib/parent-auth-scope";
import {
  SupplyListError,
  buildHouseholdSupplyList,
  copySupplyItems,
  listCopySources,
  listShopProductsForPicker,
  listSupplyItems,
  parseOwnerType,
  replaceSupplyItems,
  setParentSupplyChecks,
} from "../lib/supply-lists";
import { importSupplyListFromCsv } from "../lib/import-supply-list-csv";
import { ensureSupplyListsSchema } from "../lib/ensure-supply-lists-schema";
import { SUPPLY_SCOPES } from "@shared/supply-list";
import type { SupplyCsvColumnMapping } from "@shared/supply-list-csv";

const router = Router();
export const parentSupplyListRouter = Router();

async function ensureReady() {
  if (process.env.NODE_ENV === "production") return;
  try {
    await ensureSupplyListsSchema();
  } catch (e) {
    console.warn("[supply-lists] ensure schema:", e);
  }
}

function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof SupplyListError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  const code = (err as { code?: string })?.code;
  if (code === "42P01" || code === "42703") {
    return res.status(503).json({
      message:
        "Supply list schema is missing. Apply server/migrations/258-supply-lists.sql.",
      code: "SUPPLY_LIST_SCHEMA_MISSING",
    });
  }
  console.error(fallback, err);
  return res.status(500).json({ message: fallback });
}

const itemWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(99).default(1),
  unit: z.string().trim().max(40).nullable().optional(),
  scope: z.enum(SUPPLY_SCOPES),
  required: z.boolean().default(true),
  notes: z.string().trim().max(500).nullable().optional(),
  storeProductId: z.number().int().positive().nullable().optional(),
});

const replaceSchema = z.object({
  items: z.array(itemWriteSchema).max(100),
});

const copySchema = z.object({
  fromOwnerType: z.enum(["class", "session"]),
  fromOwnerId: z.number().int().positive(),
});

const mappingSchema = z
  .object({
    name: z.string().optional(),
    qty: z.string().optional(),
    notes: z.string().optional(),
    amazonLink: z.string().optional(),
    affiliateLink: z.string().optional(),
  })
  .optional()
  .nullable();

function parseBool(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1";
}

function csvTextFromRequest(req: Request): string {
  const files = req.files as { file?: UploadedFile | UploadedFile[] } | undefined;
  const uploaded = files?.file;
  if (uploaded) {
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    return Buffer.from(file.data).toString("utf8");
  }
  if (typeof req.body?.csv === "string") return req.body.csv;
  return "";
}

function mappingFromRequest(raw: unknown): SupplyCsvColumnMapping | null {
  if (raw == null || raw === "") return null;
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new SupplyListError("Invalid column mapping JSON", 400);
    }
  }
  const parsed = mappingSchema.safeParse(value);
  if (!parsed.success) {
    throw new SupplyListError("Invalid column mapping", 400);
  }
  return (parsed.data ?? null) as SupplyCsvColumnMapping | null;
}

router.use(async (_req, _res, next) => {
  await ensureReady();
  next();
});

router.get("/shop-products", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const products = await listShopProductsForPicker(schoolId);
    res.json({ products });
  } catch (err) {
    handleError(res, err, "Failed to load shop products");
  }
});

router.get("/copy-sources", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const sources = await listCopySources(schoolId);
    res.json(sources);
  } catch (err) {
    handleError(res, err, "Failed to load copy sources");
  }
});

router.get("/:ownerType/:ownerId", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const ownerType = parseOwnerType(String(req.params.ownerType));
    const ownerId = parseInt(req.params.ownerId, 10);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ message: "Invalid owner id" });
    const items = await listSupplyItems(schoolId, ownerType, ownerId);
    res.json({ items });
  } catch (err) {
    handleError(res, err, "Failed to load supply list");
  }
});

router.put("/:ownerType/:ownerId", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const ownerType = parseOwnerType(String(req.params.ownerType));
    const ownerId = parseInt(req.params.ownerId, 10);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ message: "Invalid owner id" });
    const parsed = replaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid supply list", errors: parsed.error.errors });
    }
    const items = await replaceSupplyItems(schoolId, ownerType, ownerId, parsed.data.items);
    res.json({ items });
  } catch (err) {
    handleError(res, err, "Failed to save supply list");
  }
});

router.post("/:ownerType/:ownerId/import-csv", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const ownerType = parseOwnerType(String(req.params.ownerType));
    const ownerId = parseInt(req.params.ownerId, 10);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ message: "Invalid owner id" });
    const csvText = csvTextFromRequest(req);
    if (!csvText.trim()) {
      return res.status(400).json({ message: "Upload a CSV file (Google Sheets: File → Download → CSV)." });
    }
    const mode = req.body?.mode === "append" ? "append" : "replace";
    const dryRun = parseBool(req.body?.dryRun);
    const mapping = mappingFromRequest(req.body?.mapping);
    const result = await importSupplyListFromCsv({
      schoolId,
      ownerType,
      ownerId,
      csvText,
      mapping,
      mode,
      dryRun,
    });
    res.json({
      items: result.items,
      preview: result.preview,
      createdProducts: result.createdProducts,
      reusedProducts: result.reusedProducts,
      warnings: result.warnings,
    });
  } catch (err) {
    handleError(res, err, "Failed to import supply list CSV");
  }
});

router.post("/:ownerType/:ownerId/copy", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    const schoolId = Number(req.schoolId);
    const ownerType = parseOwnerType(String(req.params.ownerType));
    const ownerId = parseInt(req.params.ownerId, 10);
    if (!Number.isFinite(ownerId)) return res.status(400).json({ message: "Invalid owner id" });
    const parsed = copySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid copy request", errors: parsed.error.errors });
    }
    const items = await copySupplyItems(
      schoolId,
      ownerType,
      ownerId,
      parsed.data.fromOwnerType,
      parsed.data.fromOwnerId,
    );
    res.json({ items });
  } catch (err) {
    handleError(res, err, "Failed to copy supply list");
  }
});

parentSupplyListRouter.use(async (_req, _res, next) => {
  await ensureReady();
  next();
});

parentSupplyListRouter.get("/", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const criteria = parentAuthCriteriaFromRequest(req);
    if (!criteria.email && !criteria.supabaseId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const parent = await resolveParentDbUser(storage, criteria);
    if (!parent) return res.status(401).json({ message: "Parent account not found" });
    const children = await getChildrenForAuthenticatedParent(storage, criteria);
    const childIds = children.map((c) => c.id);
    const enrollments =
      childIds.length > 0 ? await storage.getEnrollmentsByChildIds(childIds) : [];
    const list = await buildHouseholdSupplyList({
      parentId: parent.id,
      schoolId: parent.schoolId ?? null,
      children,
      enrollments,
    });
    res.json(list);
  } catch (err) {
    handleError(res, err, "Failed to load household supply list");
  }
});

const checksSchema = z.object({
  supplyItemIds: z.array(z.number().int().positive()).min(1).max(100),
  checked: z.boolean(),
});

parentSupplyListRouter.patch("/checks", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const criteria = parentAuthCriteriaFromRequest(req);
    if (!criteria.email && !criteria.supabaseId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const parsed = checksSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid check payload", errors: parsed.error.errors });
    }
    const parent = await resolveParentDbUser(storage, criteria);
    if (!parent) return res.status(401).json({ message: "Parent account not found" });
    const children = await getChildrenForAuthenticatedParent(storage, criteria);
    const childIds = children.map((c) => c.id);
    const enrollments =
      childIds.length > 0 ? await storage.getEnrollmentsByChildIds(childIds) : [];
    const list = await buildHouseholdSupplyList({
      parentId: parent.id,
      schoolId: parent.schoolId ?? null,
      children,
      enrollments,
    });
    const allowed = new Set(list.items.flatMap((row) => row.supplyItemIds));
    await setParentSupplyChecks(parent.id, parsed.data.supplyItemIds, parsed.data.checked, allowed);
    const updated = await buildHouseholdSupplyList({
      parentId: parent.id,
      schoolId: parent.schoolId ?? null,
      children,
      enrollments,
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update supply checks");
  }
});

export default router;
