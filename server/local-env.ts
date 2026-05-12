/**
 * Load `.env` then `.env.local` from the repo root before other server modules run.
 * Merged file values override earlier files; nothing overwrites variables already set
 * in the process environment (shell, CI, Replit).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const root = process.cwd();
const merged: Record<string, string> = {};
for (const name of [".env", ".env.local"] as const) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  const parsed = parse(readFileSync(path, "utf8"));
  Object.assign(merged, parsed);
}
for (const [key, value] of Object.entries(merged)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
