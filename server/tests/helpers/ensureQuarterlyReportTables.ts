import { sql } from 'drizzle-orm';
import { getDb } from '../../db';

let ensured = false;

/** Creates NY quarterly report tables on the test DB if migrations have not run yet. */
export async function ensureQuarterlyReportTables(): Promise<void> {
  if (ensured) return;
  const db = await getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quarterly_progress_meta (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL,
      quarter TEXT NOT NULL,
      quarter_label TEXT,
      asa_coop_hours DOUBLE PRECISION,
      home_instruction_hours DOUBLE PRECISION,
      draft_narrative TEXT,
      approved_narrative TEXT,
      notes_observations TEXT,
      phonogram_count INTEGER,
      math_level_label TEXT,
      math_fall_percent INTEGER,
      math_winter_percent INTEGER,
      math_spring_percent INTEGER,
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (child_id, school_year, quarter)
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quarterly_skill_checks (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL,
      quarter TEXT NOT NULL,
      skill_key TEXT NOT NULL,
      term TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unchecked',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (child_id, school_year, quarter, skill_key, term)
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quarterly_progress_reports (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      school_year TEXT NOT NULL,
      quarter TEXT NOT NULL,
      band TEXT NOT NULL,
      template_version TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      pdf_sha256 TEXT,
      generated_by INTEGER NOT NULL REFERENCES users(id),
      generated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  ensured = true;
}
