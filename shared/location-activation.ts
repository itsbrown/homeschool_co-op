import type { Location } from "./schema";

export type LocationActivationFields = Pick<
  Location,
  | "activationThreshold"
  | "activationStatus"
  | "activationNoticeHours"
  | "noticeStartedAt"
  | "chargeScheduledAt"
  | "activatedAt"
  | "collectionDeadline"
>;

/** Legacy / always-on campus — no threshold gating */
export function isLegacyActiveLocation(
  location: LocationActivationFields | null | undefined,
): boolean {
  if (!location) return true;
  return (
    location.activationThreshold == null ||
    location.activationThreshold <= 0
  );
}

/** Wishlist + deferred charge applies */
export function isLocationCollectingWishlist(
  location: LocationActivationFields | null | undefined,
): boolean {
  if (!location || isLegacyActiveLocation(location)) return false;
  return location.activationStatus === "collecting";
}

export function isLocationInNoticePeriod(
  location: LocationActivationFields | null | undefined,
): boolean {
  if (!location || isLegacyActiveLocation(location)) return false;
  return location.activationStatus === "notice_period";
}

export function isLocationActivationCancelled(
  location: LocationActivationFields | null | undefined,
): boolean {
  return location?.activationStatus === "cancelled";
}

export function locationAllowsNewWishlistSignups(
  location: LocationActivationFields | null | undefined,
): boolean {
  if (isLegacyActiveLocation(location)) return false;
  if (isLocationActivationCancelled(location)) return false;
  return isLocationCollectingWishlist(location);
}
