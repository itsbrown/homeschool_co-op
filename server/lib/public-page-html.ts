import { getSchoolCoreByRegistrationCode } from "./school-db";
import { getSchoolByStoreSlug } from "./store-storage";
import { resolvePublishedStoreCatalogItem } from "./store-catalog-items";
import { getDb } from "../db";
import { customForms, schools } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import {
  absolutePublicImage,
  applyPublicMeta,
  clipText,
  publicPageUrl,
  type PublicPageMeta,
} from "./public-page-meta";

const RESERVED_STORE_SEGMENTS = new Set(["checkout", "success", "item"]);

export async function metaForPublicPath(pathname: string): Promise<PublicPageMeta | null> {
  const path = pathname.split("?")[0];
  const storeItem = path.match(/^\/store\/([^/]+)\/([^/]+)$/);
  if (storeItem && !RESERVED_STORE_SEGMENTS.has(storeItem[2])) {
    return storeItemMeta(storeItem[1], storeItem[2], path);
  }
  const store = path.match(/^\/store\/([^/]+)\/?$/);
  if (store) return storeHomeMeta(store[1], path);
  const form = path.match(/^\/forms\/([^/]+)\/?$/);
  if (form) return formMeta(decodeURIComponent(form[1]), path);
  const registration = path.match(/^\/(?:register|school)\/([^/]+)\/?$/);
  if (registration) return registrationMeta(decodeURIComponent(registration[1]), path);
  return null;
}

export async function injectPublicMeta(html: string, pathname: string): Promise<string> {
  try {
    return applyPublicMeta(html, await metaForPublicPath(pathname));
  } catch (error) {
    console.warn("Public page meta skipped:", error instanceof Error ? error.message : error);
    return html;
  }
}

async function storeHomeMeta(slug: string, path: string): Promise<PublicPageMeta | null> {
  const school = await getSchoolByStoreSlug(slug);
  if (!school?.publicStoreEnabled) return null;
  return {
    title: `${school.name} store`,
    description: clipText(school.description, `Shop and events from ${school.name}.`),
    url: publicPageUrl(path),
    image: absolutePublicImage(school.logo),
  };
}

async function storeItemMeta(slug: string, itemSlug: string, path: string): Promise<PublicPageMeta | null> {
  const school = await getSchoolByStoreSlug(slug);
  if (!school?.publicStoreEnabled) return null;
  const item = await resolvePublishedStoreCatalogItem(school.id, itemSlug);
  if (!item) return null;
  const kind = item.productKind === "event" ? "Event" : "Store";
  return {
    title: `${item.name} · ${school.name}`,
    description: clipText(item.description, `${kind} from ${school.name}.`),
    url: publicPageUrl(path),
    image: absolutePublicImage(item.imageUrl || school.logo),
  };
}

async function formMeta(slug: string, path: string): Promise<PublicPageMeta | null> {
  const db = await getDb();
  const [form] = await db
    .select({
      title: customForms.title,
      description: customForms.description,
      schoolId: customForms.schoolId,
    })
    .from(customForms)
    .where(and(eq(customForms.slug, slug), eq(customForms.isActive, true), eq(customForms.accessLevel, "public")));
  if (!form) return null;
  const [school] = await db
    .select({ name: schools.name, logo: schools.logo })
    .from(schools)
    .where(eq(schools.id, form.schoolId));
  const schoolName = school?.name || "School";
  return {
    title: `${form.title} · ${schoolName}`,
    description: clipText(form.description, `Form from ${schoolName}.`),
    url: publicPageUrl(path),
    image: absolutePublicImage(school?.logo),
  };
}

async function registrationMeta(code: string, path: string): Promise<PublicPageMeta | null> {
  const school = await getSchoolCoreByRegistrationCode(code);
  if (!school) return null;
  return schoolMeta(school.name, school.description, school.logo, path);
}

function schoolMeta(
  name: string,
  description: string | null | undefined,
  logo: string | null | undefined,
  path: string,
): PublicPageMeta {
  return {
    title: `Register at ${name}`,
    description: clipText(description, `Registration for ${name}.`),
    url: publicPageUrl(path),
    image: absolutePublicImage(logo),
  };
}
