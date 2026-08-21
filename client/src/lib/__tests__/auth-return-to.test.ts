import {
  AUTH_RETURN_TO_KEY,
  buildOAuthLoginRedirectUrl,
  consumeAuthReturnDestination,
  canLeaveLoginPage,
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

  it("loginPathWithReturnTo rejects /login as a destination", () => {
    const path = loginPathWithReturnTo("/login?returnTo=%2Fstore%2Fasa");
    expect(path).toBe("/login?returnTo=%2Fdashboard");
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/dashboard");
  });

  it("consumeAuthReturnDestination ignores auth landing pages", () => {
    window.history.replaceState({}, "", "/login?returnTo=%2Flogin");
    expect(consumeAuthReturnDestination()).toBe("/dashboard");
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, "/login?returnTo=/store/x");
    expect(consumeAuthReturnDestination()).toBe("/dashboard");
  });

  it("canLeaveLoginPage is true with a session even before roles load", () => {
    expect(
      canLeaveLoginPage({ isAuthenticated: true, hasUser: true }),
    ).toBe(true);
    expect(
      canLeaveLoginPage({ isAuthenticated: false, hasUser: false }),
    ).toBe(false);
    expect(
      canLeaveLoginPage({
        isAuthenticated: true,
        hasUser: true,
        registrationRequired: true,
      }),
    ).toBe(false);
    expect(
      canLeaveLoginPage({
        isAuthenticated: true,
        hasUser: true,
        redirectBlocked: true,
      }),
    ).toBe(true);
    expect(
      canLeaveLoginPage({
        isAuthenticated: false,
        hasUser: false,
        redirectBlocked: true,
      }),
    ).toBe(false);
    expect(
      canLeaveLoginPage({
        isAuthenticated: true,
        hasUser: true,
        stayOnLogin: true,
      }),
    ).toBe(false);
  });

  it("loginPathWithReturnTo maps / to /dashboard", () => {
    const path = loginPathWithReturnTo("/");
    expect(path).toBe("/login?returnTo=%2Fdashboard");
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/dashboard");
  });

  it("isStayOnLogin blocks leave when signed_out query is set", () => {
    window.history.replaceState({}, "", "/login?signed_out=1");
    expect(
      canLeaveLoginPage({ isAuthenticated: true, hasUser: true }),
    ).toBe(false);
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
