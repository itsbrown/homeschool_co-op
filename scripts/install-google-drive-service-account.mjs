#!/usr/bin/env node
/**
 * Install a Google Cloud service-account key for Week Planner Drive reindex.
 *
 *   node scripts/install-google-drive-service-account.mjs ~/Downloads/asa-drive-*.json
 *
 * Writes secrets/google-drive-service-account.json (gitignored) and sets
 * GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE in .env. Restart `npm run dev` after.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/install-google-drive-service-account.mjs /path/to/service-account.json");
  process.exit(1);
}

const srcPath = resolve(src);
if (!existsSync(srcPath)) {
  console.error(`File not found: ${srcPath}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(srcPath, "utf8"));
} catch {
  console.error("That file is not valid JSON.");
  process.exit(1);
}

if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key) {
  console.error("Need a Google service-account key (type, client_email, private_key).");
  process.exit(1);
}

const destDir = resolve("secrets");
mkdirSync(destDir, { recursive: true });
const dest = resolve(destDir, "google-drive-service-account.json");
copyFileSync(srcPath, dest);

const envPath = resolve(".env");
const line = `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=${dest}`;
if (existsSync(envPath)) {
  const current = readFileSync(envPath, "utf8");
  const next = current.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=")
    ? current.replace(/^GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=.*$/m, line)
    : `${current.replace(/\s*$/, "")}\n\n${line}\n`;
  writeFileSync(envPath, next);
} else {
  writeFileSync(envPath, `${line}\n`);
}

console.log(`Installed Drive key for ${parsed.client_email}`);
console.log("Share each lesson folder with that email (Viewer).");
console.log("Restart npm run dev, then Connect folder again.");
