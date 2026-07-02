import {
  AUTH_RETURN_TO_KEY,
  buildOAuthLoginRedirectUrl,
  consumeAuthReturnDestination,
  loginPathWithReturnTo,
  resolveAuthReturnDestination,
  stripOAuthTokensFromUrl,
  syncAuthReturnToFromUrl,
} from "../auth-return-to";

describe("auth-return-to", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("loginPathWithReturnTo persists and encodes checkout path", () => {
    const path = loginPathWithReturnTo("/store/asa/checkout");
    expect(path).toBe("/login?returnTo=%2Fstore%2Fasa%2Fcheckout");
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/store/asa/checkout");
  });

  it("loginPathWithReturnTo supports extra query params", () => {
    const path = loginPathWithReturnTo("/store/asa/checkout", { session_expired: "1" });
    expect(path).toContain("session_expired=1");
    expect(path).toContain("returnTo=%2Fstore%2Fasa%2Fcheckout");
  });

  it("resolveAuthReturnDestination prefers URL then sessionStorage", () => {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, "/store/from-storage/checkout");
    window.history.replaceState({}, "", "/login?returnTo=%2Fstore%2Ffrom-url%2Fcheckout");
    expect(resolveAuthReturnDestination()).toBe("/store/from-url/checkout");

    window.history.replaceState({}, "", "/login");
    expect(resolveAuthReturnDestination()).toBe("/store/from-storage/checkout");
  });

  it("syncAuthReturnToFromUrl copies returnTo param to sessionStorage", () => {
    window.history.replaceState({}, "", "/login?returnTo=%2Fstore%2Fslug%2Fcheckout");
    syncAuthReturnToFromUrl();
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/store/slug/checkout");
  });

  it("stripOAuthTokensFromUrl removes code but keeps returnTo", () => {
    window.history.replaceState(
      {},
      "",
      "/login?returnTo=%2Fstore%2Fx%2Fcheckout&code=oauth_code&state=abc",
    );
    stripOAuthTokensFromUrl();
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?returnTo=%2Fstore%2Fx%2Fcheckout");
  });

  it("consumeAuthReturnDestination clears storage after first read", () => {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, "/store/from-storage/checkout");
    window.history.replaceState({}, "", "/login");
    expect(consumeAuthReturnDestination()).toBe("/store/from-storage/checkout");
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
    expect(consumeAuthReturnDestination()).toBe("/dashboard");
  });

  it("buildOAuthLoginRedirectUrl includes returnTo on login URL", () => {
    window.history.replaceState({}, "", "/login?returnTo=%2Fstore%2Ftest%2Fcheckout");
    syncAuthReturnToFromUrl();
    expect(buildOAuthLoginRedirectUrl()).toBe(
      `${window.location.origin}/login?returnTo=%2Fstore%2Ftest%2Fcheckout`,
    );
  });
});
