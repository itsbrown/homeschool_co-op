/**
 * Load `.env` then `.env.local` from the repo root before other server modules run.
 * Merged file values override earlier files. Injected env (CI, Replit, production)
 * is never overwritten. A leftover shell URL for retired Neon `asa_test` yields to
 * the file `DATABASE_URL` so local `npm run dev` uses the project `.env`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { applyLocalEnv, isInjectedDatabaseEnv } from "./lib/apply-local-env";

const root = process.cwd();
const merged: Record<string, string> = {};
for (const name of [".env", ".env.local"] as const) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parse(readFileSync(path, "utf8"));
  Object.assign(merged, parsed);
}
applyLocalEnv({
  processEnv: process.env,
  fileVars: merged,
  injectedEnv: isInjectedDatabaseEnv(),
});
