CREATE TABLE IF NOT EXISTS payroll_jobs (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL,
  job_key TEXT NOT NULL,
  person_name TEXT NOT NULL,
  job_label TEXT NOT NULL,
  rate_cents INTEGER NOT NULL,
  weekly_minutes INTEGER NOT NULL,
  credit BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_jobs_school_key
  ON payroll_jobs (school_id, job_key);

CREATE TABLE IF NOT EXISTS payroll_checklist_access (
  school_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, user_id)
);

CREATE TABLE IF NOT EXISTS payroll_days (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL,
  work_date DATE NOT NULL,
  note TEXT,
  saved_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_days_school_date
  ON payroll_days (school_id, work_date);

CREATE TABLE IF NOT EXISTS payroll_day_lines (
  id SERIAL PRIMARY KEY,
  payroll_day_id INTEGER NOT NULL REFERENCES payroll_days(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL,
  person_name TEXT NOT NULL,
  job_label TEXT NOT NULL,
  present TEXT NOT NULL,
  different_minutes INTEGER,
  note TEXT,
  rate_cents_snapshot INTEGER NOT NULL,
  weekly_minutes_snapshot INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_day_lines_day_job
  ON payroll_day_lines (payroll_day_id, job_id);
