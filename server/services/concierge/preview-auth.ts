import { previewDemoParentById, previewDemoParentByKey } from "./preview-memory";

export const PREVIEW_DEMO_COOKIE = "asa_preview_parent";
export const PREVIEW_DEMO_HEADER = "x-preview-demo-parent";

function headerValue(headers: any, name: string): string | null {
  const raw = headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return null;
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function previewParentFromRequest(req: { headers: any }) {
  const header = headerValue(req.headers, PREVIEW_DEMO_HEADER);
  if (header) {
    const asNumber = Number(header);
    if (Number.isInteger(asNumber)) {
      const byId = previewDemoParentById(asNumber);
      if (byId) return byId;
    }
    const byKey = previewDemoParentByKey(header.toLowerCase());
    if (byKey) return byKey;
  }
  const cookie = readCookie(
    typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
    PREVIEW_DEMO_COOKIE,
  );
  if (!cookie) return null;
  const id = Number(cookie);
  if (!Number.isInteger(id)) return null;
  return previewDemoParentById(id);
}

export function attachPreviewDemoUser(req: { headers: any; user?: { id: number; schoolId: number; email: string } }): void {
  const parent = previewParentFromRequest(req);
  if (!parent) {
    delete req.user;
    return;
  }
  req.user = { id: parent.id, schoolId: parent.schoolId, email: parent.email };
}

export function previewDemoCookie(parentId: number, clear = false, secure = false): string {
  const secureAttr = secure ? "; Secure" : "";
  const maxAge = clear ? 0 : 60 * 60 * 24 * 7;
  const value = clear ? "" : String(parentId);
  return `${PREVIEW_DEMO_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`;
}

/** Vercel terminates TLS at the edge, so trust x-forwarded-proto as well as req.secure. */
export function previewRequestIsHttps(req: { secure?: boolean; headers?: Record<string, unknown> }): boolean {
  if (req.secure) return true;
  const raw = req.headers?.["x-forwarded-proto"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === "string" && first.split(",")[0].trim().toLowerCase() === "https";
}
