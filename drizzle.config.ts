import { defineConfig } from "drizzle-kit";

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
