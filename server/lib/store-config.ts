/** Global + per-school gates for the public store lane. */

export const PUBLIC_STORE_CHECKOUT_ENABLED =
  process.env.PUBLIC_STORE_ENABLED === 'true' ||
  process.env.PUBLIC_STORE_CHECKOUT_ENABLED === 'true';

export const STORE_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

export const RESERVED_STORE_SLUGS = new Set([
  'admin',
  'api',
  'store',
  'enroll',
  'login',
  'register',
  'cart',
  'school',
  'forms',
  'fundraiser',
]);

export function normalizeStoreSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateStoreSlug(slug: string): { ok: true } | { ok: false; message: string } {
  const normalized = normalizeStoreSlug(slug);
  if (!normalized || normalized.length < 2) {
    return { ok: false, message: 'Store URL slug must be at least 2 characters.' };
  }
  if (normalized.length > 64) {
    return { ok: false, message: 'Store URL slug must be 64 characters or fewer.' };
  }
  if (RESERVED_STORE_SLUGS.has(normalized)) {
    return { ok: false, message: 'That store URL slug is reserved.' };
  }
  return { ok: true };
}

export function isPublicStoreGloballyEnabled(): boolean {
  return process.env.PUBLIC_STORE_ENABLED === 'true';
}

export function isStoreCheckoutAllowed(): boolean {
  return PUBLIC_STORE_CHECKOUT_ENABLED;
}

export function generateStoreAccessToken(): string {
  return `sto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

export function generateStoreSnapshotId(): string {
  return `store_snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
