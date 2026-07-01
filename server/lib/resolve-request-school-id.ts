import type { Request } from "express";
import { storage } from "../storage";
import { resolveSchoolIdForUser } from "./resolve-school-id";
import type { UploadCategory } from "../services/fileUploadService";

/** Categories that include `school-{id}` in the object storage path when schoolId is known. */
export const SCHOOL_SCOPED_UPLOAD_CATEGORIES = new Set<UploadCategory>([
  "logos",
  "fundraiserProducts",
  "storePrograms",
  "storeProducts",
  "documents",
  "knowledgeBase",
  "productOrderImages",
]);

export async function resolveRequestSchoolId(
  req: Request,
  category: UploadCategory,
  bodySchoolId?: unknown,
): Promise<number | undefined> {
  if (bodySchoolId != null && bodySchoolId !== "") {
    const parsed = parseInt(String(bodySchoolId), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (!SCHOOL_SCOPED_UPLOAD_CATEGORIES.has(category)) {
    return undefined;
  }

  const email = (req as any).user?.email as string | undefined;
  if (!email) {
    return undefined;
  }

  const user = await storage.getUserByEmail(email);
  if (!user) {
    return undefined;
  }

  const schoolId = await resolveSchoolIdForUser(user);
  return schoolId ?? undefined;
}
