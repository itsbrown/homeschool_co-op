/**
 * Fake concierge families for LOCAL Postgres only.
 *
 *   CONCIERGE_LOCAL_DATABASE_URL=postgresql://concierge:concierge@127.0.0.1:5432/asa_concierge_local \
 *     npx tsx scripts/seed-concierge-local.ts
 *
 * Refuses any host that is not localhost, and any database name that looks like
 * production. Does not read a hosted DATABASE_URL. Does not call db:push.
 * Does not connect to Supabase.
 */
import { resolveConciergeLocalUrl } from "./lib/concierge-local-guard";

const url = process.env.CONCIERGE_LOCAL_DATABASE_URL;
try {
  if (!url) throw new Error("Set CONCIERGE_LOCAL_DATABASE_URL");
  process.env.CONCIERGE_LOCAL_DATABASE_URL = url;
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== url) {
    delete process.env.DATABASE_URL;
  }
  resolveConciergeLocalUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

process.env.DATABASE_URL = url;

const { seedConciergeLocal } = await import("./lib/concierge-local-seed");
const seeded = await seedConciergeLocal();
console.log(JSON.stringify({
  ok: true,
  schoolId: seeded.schoolId,
  weekStart: seeded.weekStart,
  parents: {
    avery: seeded.parents.avery.id,
    blake: seeded.parents.blake.id,
    casey: seeded.parents.casey.id,
  },
  children: {
    rowan: seeded.children.rowan.id,
    quinn: seeded.children.quinn.id,
    skyler: seeded.children.skyler.id,
    reese: seeded.children.reese.id,
  },
  events: seeded.events,
}, null, 2));
