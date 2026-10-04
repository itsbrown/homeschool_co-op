import { defineConfig } from "drizzle-kit";
import { assertDbPushAllowed } from "./scripts/guard-db-push.mjs";

// Catch `npx drizzle-kit push` as well as `npm run db:push`. Other drizzle-kit
// commands (generate, studio, check) are unchanged. ALLOW_DB_PUSH never
// overrides a production target.
if (process.argv.includes("push")) {
  assertDbPushAllowed();
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Tables that exist in the database but are intentionally NOT modeled in
  // shared/schema.ts. Listing them here prevents drizzle-kit from prompting to
  // drop them on every `db:push`. Kept narrowly scoped to known-safe leftovers.
  //   * scheduled_payments_backup — manual snapshot retained for forensic use.
  tablesFilter: ["!scheduled_payments_backup"],
});
