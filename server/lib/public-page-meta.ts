/** Public pages are shared from the accounts host, not the marketing site. */
export const PUBLIC_SITE_ORIGIN = "https://accounts.americanseekersacademy.com";
export const DEFAULT_OG_IMAGE_PATH = "/og-default.png";

export type PublicPageMeta = {
  title: string;
  description: string;
  url: string;
  image: string;
};

export function publicPageUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${PUBLIC_SITE_ORIGIN}${path.split("?")[0]}`;
}

export function absolutePublicImage(src: string | null | undefined): string {
  const fallback = `${PUBLIC_SITE_ORIGIN}${DEFAULT_OG_IMAGE_PATH}`;
  if (!src) return fallback;
  if (src.startsWith("https://") || src.startsWith("http://")) return src;
  if (src.startsWith("/")) return `${PUBLIC_SITE_ORIGIN}${src}`;
  return fallback;
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function clipText(value: string | null | undefined, fallback: string): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

/** Replace the tags in client/index.html. Leaves the document alone when meta is null. */
export function applyPublicMeta(html: string, meta: PublicPageMeta | null): string {
  if (!meta) return html;
  const title = escapeHtmlAttribute(meta.title);
  const description = escapeHtmlAttribute(meta.description);
  const url = escapeHtmlAttribute(meta.url);
  const image = escapeHtmlAttribute(meta.image);
  let next = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  next = replaceMeta(next, "name", "description", description);
  next = replaceMeta(next, "property", "og:title", title);
  next = replaceMeta(next, "property", "og:description", description);
  next = replaceMeta(next, "property", "og:url", url);
  if (/property="og:image"/.test(next)) {
    next = replaceMeta(next, "property", "og:image", image);
  } else {
    next = next.replace("</head>", `    <meta property="og:image" content="${image}" />\n  </head>`);
  }
  return next;
}

function replaceMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const pattern = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${key}" content="${content}" />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

export const ROBOTS_TXT = `User-agent: *
Allow: /store/
Allow: /forms/
Allow: /register/
Allow: /school/
Allow: /school-application
Disallow: /api/
Disallow: /parent
Disallow: /schools/
Disallow: /school-admin
Disallow: /admin
Disallow: /superadmin
Disallow: /dashboard
Disallow: /payments
Disallow: /payment
Disallow: /cart
Disallow: /children
Disallow: /educator
Disallow: /settings
Disallow: /notifications
Disallow: /messages
Disallow: /schedule
Disallow: /login

Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap.xml
`;
