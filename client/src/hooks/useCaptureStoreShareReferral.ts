import { useEffect } from "react";
import { captureStoreShareReferralFromUrl } from "@/lib/store-share-attribution";

/** On mount, persist `?userId=` from the URL for checkout attribution. */
export function useCaptureStoreShareReferral(storeSlug: string): void {
  useEffect(() => {
    if (!storeSlug) return;
    captureStoreShareReferralFromUrl(storeSlug);
  }, [storeSlug]);
}
