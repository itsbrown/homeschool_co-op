import { schools } from "@shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { getPublishedStoreCatalogWithSlugs } from "./store-catalog-items";
import { PUBLIC_SITE_ORIGIN } from "./public-page-meta";

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Public store homes plus each published catalog item, including events. */
export async function buildPublicSitemapXml(): Promise<string> {
  const urls: string[] = [];
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: schools.id, storeSlug: schools.storeSlug })
      .from(schools)
      .where(and(eq(schools.publicStoreEnabled, true), isNotNull(schools.storeSlug)));
    for (const row of rows) {
      if (!row.storeSlug) continue;
      urls.push(`${PUBLIC_SITE_ORIGIN}/store/${encodeURIComponent(row.storeSlug)}`);
      const catalog = await getPublishedStoreCatalogWithSlugs(row.id);
      for (const item of catalog) {
        if (!item.slug) continue;
        urls.push(`${PUBLIC_SITE_ORIGIN}/store/${encodeURIComponent(row.storeSlug)}/${encodeURIComponent(item.slug)}`);
      }
    }
  } catch (error) {
    console.warn("Public sitemap lookup skipped:", error instanceof Error ? error.message : error);
  }

  const body = urls
    .map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
