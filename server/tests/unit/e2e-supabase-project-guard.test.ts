import { describe, expect, it } from "@jest/globals";
import {
  E2E_LIVE_SUPABASE_PROJECT_CODE,
  E2eLiveSupabaseProjectError,
  LIVE_ASA_SUPABASE_HOST,
  LIVE_ASA_SUPABASE_PROJECT_REF,
  assertE2eSupabaseProjectIsDedicated,
  assertPlaywrightServerUsesDedicatedSupabase,
  envTargetsLiveAsaSupabase,
  requestLinksSupabaseAuth,
  supabaseUrlTargetsLiveAsaProject,
} from "../../lib/e2e-supabase-project-guard";

const dedicated = "https://abcdefghijklmnopqrst.supabase.co";

describe("e2e supabase project guard", () => {
  it("matches the Adaptive Learning Program ref and host", () => {
    expect(supabaseUrlTargetsLiveAsaProject(`https://${LIVE_ASA_SUPABASE_HOST}`)).toBe(true);
    expect(
      supabaseUrlTargetsLiveAsaProject(`https://${LIVE_ASA_SUPABASE_PROJECT_REF}.supabase.co`),
    ).toBe(true);
    expect(
      supabaseUrlTargetsLiveAsaProject(`HTTPS://${LIVE_ASA_SUPABASE_PROJECT_REF}.SUPABASE.CO/`),
    ).toBe(true);
    expect(supabaseUrlTargetsLiveAsaProject(dedicated)).toBe(false);
    expect(supabaseUrlTargetsLiveAsaProject("http://127.0.0.1:54321")).toBe(false);
    expect(supabaseUrlTargetsLiveAsaProject("")).toBe(false);
    expect(supabaseUrlTargetsLiveAsaProject(undefined)).toBe(false);
  });

  it("refuses when either SUPABASE_URL or VITE_SUPABASE_URL is the live project", () => {
    const live = `https://${LIVE_ASA_SUPABASE_HOST}`;
    expect(envTargetsLiveAsaSupabase({ SUPABASE_URL: live } as NodeJS.ProcessEnv)).toBe(true);
    expect(
      envTargetsLiveAsaSupabase({ VITE_SUPABASE_URL: live, SUPABASE_URL: dedicated } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      envTargetsLiveAsaSupabase({
        SUPABASE_URL: dedicated,
        VITE_SUPABASE_URL: dedicated,
      } as NodeJS.ProcessEnv),
    ).toBe(false);

    expect(() =>
      assertE2eSupabaseProjectIsDedicated({ SUPABASE_URL: live } as NodeJS.ProcessEnv),
    ).toThrow(E2eLiveSupabaseProjectError);

    try {
      assertE2eSupabaseProjectIsDedicated({
        VITE_SUPABASE_URL: `https://${LIVE_ASA_SUPABASE_PROJECT_REF}.supabase.co`,
      } as NodeJS.ProcessEnv);
      throw new Error("expected the guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(E2eLiveSupabaseProjectError);
      const refusal = error as E2eLiveSupabaseProjectError;
      expect(refusal.code).toBe(E2E_LIVE_SUPABASE_PROJECT_CODE);
      expect(refusal.message).toMatch(/dedicated Supabase project/);
      expect(refusal.message).toMatch(/Adaptive Learning Program/);
      expect(refusal.message).toMatch(/E2E_SUPABASE_URL/);
      expect(refusal.message).toMatch(new RegExp(LIVE_ASA_SUPABASE_PROJECT_REF));
    }
  });

  it("allows a dedicated project", () => {
    expect(() =>
      assertE2eSupabaseProjectIsDedicated({
        SUPABASE_URL: dedicated,
        VITE_SUPABASE_URL: dedicated,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("blocks the Playwright server only, so production signup is unchanged", () => {
    const live = { SUPABASE_URL: `https://${LIVE_ASA_SUPABASE_HOST}` } as NodeJS.ProcessEnv;
    expect(() => assertPlaywrightServerUsesDedicatedSupabase(live)).not.toThrow();
    expect(() =>
      assertPlaywrightServerUsesDedicatedSupabase({
        ...live,
        PLAYWRIGHT_WEB_SERVER: "true",
      }),
    ).toThrow(E2eLiveSupabaseProjectError);
    expect(() =>
      assertPlaywrightServerUsesDedicatedSupabase({
        SUPABASE_URL: dedicated,
        PLAYWRIGHT_WEB_SERVER: "true",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("detects seed body flags that would create auth users", () => {
    expect(requestLinksSupabaseAuth({ linkSupabaseAuth: true })).toBe(true);
    expect(requestLinksSupabaseAuth({ linkSupabaseAuthAdmin: true })).toBe(true);
    expect(requestLinksSupabaseAuth({ linkSupabaseAuthParentB: true })).toBe(true);
    expect(requestLinksSupabaseAuth({ linkSupabaseAuth: false })).toBe(false);
    expect(requestLinksSupabaseAuth({ withMembership: true })).toBe(false);
    expect(requestLinksSupabaseAuth(null)).toBe(false);
  });
});
