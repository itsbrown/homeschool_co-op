-- Education standards registry: jurisdictions, frameworks, standards, KPI thresholds (additive)

CREATE TABLE IF NOT EXISTS education_jurisdictions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('national', 'state')),
  is_active boolean NOT NULL DEFAULT true,
  report_template_key text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS education_standard_frameworks (
  id serial PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES education_jurisdictions(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN ('ela', 'math', 'science', 'social_studies')),
  title text NOT NULL,
  version text,
  source_label text,
  effective_year integer,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, subject, version)
);

CREATE INDEX IF NOT EXISTS idx_edu_frameworks_jurisdiction
  ON education_standard_frameworks (jurisdiction_id);

CREATE TABLE IF NOT EXISTS education_standards (
  id serial PRIMARY KEY,
  framework_id integer NOT NULL REFERENCES education_standard_frameworks(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  grade_levels jsonb NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (framework_id, code)
);

CREATE INDEX IF NOT EXISTS idx_edu_standards_framework
  ON education_standards (framework_id);

CREATE TABLE IF NOT EXISTS education_kpi_thresholds (
  id serial PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES education_jurisdictions(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN ('ela', 'math', 'science', 'social_studies')),
  metric text NOT NULL CHECK (metric IN ('lexile')),
  grade_level text NOT NULL,
  below_max integer NOT NULL,
  at_min integer NOT NULL,
  at_max integer NOT NULL,
  above_min integer NOT NULL,
  source_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, subject, metric, grade_level)
);

CREATE INDEX IF NOT EXISTS idx_edu_kpi_jurisdiction_subject
  ON education_kpi_thresholds (jurisdiction_id, subject, metric);

-- Best-effort normalize common free-text school/location states to ISO-2
UPDATE schools SET state = 'NY' WHERE lower(trim(state)) IN ('new york', 'n.y.', 'n.y', 'ny');
UPDATE schools SET state = 'GA' WHERE lower(trim(state)) IN ('georgia', 'ga');
UPDATE schools SET state = 'FL' WHERE lower(trim(state)) IN ('florida', 'fl');
UPDATE schools SET state = 'TX' WHERE lower(trim(state)) IN ('texas', 'tx');
UPDATE locations SET state = 'NY' WHERE lower(trim(state)) IN ('new york', 'n.y.', 'n.y', 'ny');
UPDATE locations SET state = 'GA' WHERE lower(trim(state)) IN ('georgia', 'ga');
UPDATE locations SET state = 'FL' WHERE lower(trim(state)) IN ('florida', 'fl');
UPDATE locations SET state = 'TX' WHERE lower(trim(state)) IN ('texas', 'tx');
