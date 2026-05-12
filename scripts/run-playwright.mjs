#!/usr/bin/env node
/**
 * Cursor (and some sandboxes) set PLAYWRIGHT_BROWSERS_PATH to a temp dir where
 * installs can be incomplete; Playwright then fails to launch Chromium.
 * Unset that path so `playwright install` and `playwright test` use a normal cache.
 *
 * If `.env.e2e` exists in the repo root, load KEY=VALUE lines into the child
 * environment (does not override variables already set in the shell).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function applyOptionalEnvE2e(baseEnv) {
  const envPath = join(__dirname, "..", ".env.e2e");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (baseEnv[key] === undefined || baseEnv[key] === "") {
      baseEnv[key] = val;
    }
  }
}

const env = { ...process.env };
applyOptionalEnvE2e(env);
if (env.PLAYWRIGHT_BROWSERS_PATH?.includes("cursor-sandbox-cache")) {
  delete env.PLAYWRIGHT_BROWSERS_PATH;
}

const args = process.argv.slice(2);
const require = createRequire(import.meta.url);
const playwrightCli = join(
  dirname(require.resolve("playwright/package.json")),
  "cli.js",
);
const child = spawn(process.execPath, [playwrightCli, ...args], {
  stdio: "inherit",
  shell: false,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
