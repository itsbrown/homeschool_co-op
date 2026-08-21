import { describe, expect, it } from "@jest/globals";
import {
  applyLocalEnv,
  isInjectedDatabaseEnv,
  isRetiredNeonTestUrl,
  postgresUrlParts,
} from "../lib/apply-local-env";

const neonTest =
  "postgresql://owner:secret@ep-example.us-west-2.aws.neon.tech/asa_test?sslmode=require";
const neonProd =
  "postgresql://owner:secret@ep-prod.us-west-2.aws.neon.tech/neondb?sslmode=require";
const railway =
  "postgresql://postgres:secret@tokaido.proxy.rlwy.net:37126/railway";

describe("postgresUrlParts", () => {
  it("parses host and database", () => {
    expect(postgresUrlParts(neonTest)).toEqual({
      hostname: "ep-example.us-west-2.aws.neon.tech",
      database: "asa_test",
    });
    expect(postgresUrlParts(railway)).toEqual({
      hostname: "tokaido.proxy.rlwy.net",
      database: "railway",
    });
  });
});

describe("isRetiredNeonTestUrl", () => {
  it("matches only Neon asa_test", () => {
    expect(isRetiredNeonTestUrl(neonTest)).toBe(true);
    expect(isRetiredNeonTestUrl(neonProd)).toBe(false);
    expect(isRetiredNeonTestUrl(railway)).toBe(false);
    expect(isRetiredNeonTestUrl(undefined)).toBe(false);
  });
});

describe("isInjectedDatabaseEnv", () => {
  it("treats CI, production, and Replit as injected", () => {
    expect(isInjectedDatabaseEnv({ CI: "true" })).toBe(true);
    expect(isInjectedDatabaseEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isInjectedDatabaseEnv({ REPL_ID: "abc" })).toBe(true);
    expect(isInjectedDatabaseEnv({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("applyLocalEnv", () => {
  it("fills unset keys from files", () => {
    const processEnv: NodeJS.ProcessEnv = {};
    applyLocalEnv({
      processEnv,
      fileVars: { DATABASE_URL: railway },
      injectedEnv: false,
    });
    expect(processEnv.DATABASE_URL).toBe(railway);
  });

  it("replaces retired Neon asa_test with .env on local", () => {
    const logs: string[] = [];
    const processEnv: NodeJS.ProcessEnv = { DATABASE_URL: neonTest };
    applyLocalEnv({
      processEnv,
      fileVars: { DATABASE_URL: railway },
      injectedEnv: false,
      log: (m) => logs.push(m),
    });
    expect(processEnv.DATABASE_URL).toBe(railway);
    expect(logs.join("\n")).toMatch(/Ignoring retired Neon DATABASE_URL/);
    expect(logs.join("\n")).not.toMatch(/secret/);
  });

  it("keeps production Neon when with-prod-env already set DATABASE_URL", () => {
    const processEnv: NodeJS.ProcessEnv = { DATABASE_URL: neonProd };
    applyLocalEnv({
      processEnv,
      fileVars: { DATABASE_URL: railway },
      injectedEnv: false,
      log: () => {},
    });
    expect(processEnv.DATABASE_URL).toBe(neonProd);
  });

  it("does not replace retired Neon when CI/Replit injected env wins", () => {
    const processEnv: NodeJS.ProcessEnv = { DATABASE_URL: neonTest };
    applyLocalEnv({
      processEnv,
      fileVars: { DATABASE_URL: railway },
      injectedEnv: true,
    });
    expect(processEnv.DATABASE_URL).toBe(neonTest);
  });

  it("does not overwrite unrelated keys already in the shell", () => {
    const processEnv: NodeJS.ProcessEnv = { SUPABASE_URL: "https://from-shell.example" };
    applyLocalEnv({
      processEnv,
      fileVars: { SUPABASE_URL: "https://from-file.example" },
      injectedEnv: false,
    });
    expect(processEnv.SUPABASE_URL).toBe("https://from-shell.example");
  });
});
