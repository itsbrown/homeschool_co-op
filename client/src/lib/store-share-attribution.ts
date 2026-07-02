const STORAGE_KEY = "store_share_referrals_v1";

export type StoreShareReferral = {
  userId: number;
  capturedAt: string;
};

type StoreShareReferralMap = Record<string, StoreShareReferral>;

function readReferralMap(): StoreShareReferralMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoreShareReferralMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeReferralMap(map: StoreShareReferralMap): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function parseStoreShareUserIdParam(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const id = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** Persist last-touch referral for a store slug (sessionStorage). */
export function saveStoreShareReferral(storeSlug: string, userId: number): void {
  if (!storeSlug.trim() || userId <= 0) return;
  const map = readReferralMap();
  map[storeSlug] = { userId, capturedAt: new Date().toISOString() };
  writeReferralMap(map);
}

export function getStoreShareReferral(storeSlug: string): StoreShareReferral | null {
  if (!storeSlug.trim()) return null;
  return readReferralMap()[storeSlug] ?? null;
}

export function getStoreShareReferralUserId(storeSlug: string): number | null {
  return getStoreShareReferral(storeSlug)?.userId ?? null;
}

/** Read `?userId=` from the current URL and persist when valid. */
export function captureStoreShareReferralFromUrl(storeSlug: string): number | null {
  if (typeof window === "undefined" || !storeSlug.trim()) return null;
  const params = new URLSearchParams(window.location.search);
  const userId = parseStoreShareUserIdParam(params.get("userId"));
  if (userId != null) {
    saveStoreShareReferral(storeSlug, userId);
  }
  return userId;
}
