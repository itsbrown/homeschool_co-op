import {
  captureStoreShareReferralFromUrl,
  getStoreShareReferral,
  getStoreShareReferralUserId,
  parseStoreShareUserIdParam,
  saveStoreShareReferral,
} from "@/lib/store-share-attribution";

describe("store share attribution", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/store/demo-store");
  });

  it("parseStoreShareUserIdParam accepts positive integers", () => {
    expect(parseStoreShareUserIdParam("123")).toBe(123);
    expect(parseStoreShareUserIdParam("0")).toBeNull();
    expect(parseStoreShareUserIdParam("abc")).toBeNull();
  });

  it("saveStoreShareReferral and getStoreShareReferral round-trip per store", () => {
    saveStoreShareReferral("demo-store", 55);
    const ref = getStoreShareReferral("demo-store");
    expect(ref?.userId).toBe(55);
    expect(ref?.capturedAt).toBeTruthy();
    expect(getStoreShareReferralUserId("demo-store")).toBe(55);
    expect(getStoreShareReferral("other-store")).toBeNull();
  });

  it("captureStoreShareReferralFromUrl reads userId query param", () => {
    window.history.replaceState({}, "", "/store/demo-store?userId=99");
    expect(captureStoreShareReferralFromUrl("demo-store")).toBe(99);
    expect(getStoreShareReferralUserId("demo-store")).toBe(99);
  });
});
