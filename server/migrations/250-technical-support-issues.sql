-- User-submitted support / issue reports (persistent ticket store)
-- Safe to re-run

CREATE TABLE IF NOT EXISTS technical_support_issues (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'parent',
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  issue_category TEXT NOT NULL DEFAULT 'platform',
  issue_type TEXT NOT NULL DEFAULT 'other',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  user_agent TEXT,
  url TEXT,
  browser_info JSONB NOT NULL DEFAULT '{}',
  reproduction_steps JSONB NOT NULL DEFAULT '[]',
  recommended_actions JSONB NOT NULL DEFAULT '[]',
  ai_diagnosis TEXT,
  ai_user_response TEXT,
  screenshot_object_path TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  resolution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT technical_support_issues_category_check
    CHECK (issue_category IN ('platform', 'school_policy')),
  CONSTRAINT technical_support_issues_status_check
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  CONSTRAINT technical_support_issues_severity_check
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_technical_support_issues_school_id
  ON technical_support_issues (school_id);

CREATE INDEX IF NOT EXISTS idx_technical_support_issues_status
  ON technical_support_issues (status);

CREATE INDEX IF NOT EXISTS idx_technical_support_issues_category
  ON technical_support_issues (issue_category);

CREATE INDEX IF NOT EXISTS idx_technical_support_issues_created_at
  ON technical_support_issues (created_at DESC);
