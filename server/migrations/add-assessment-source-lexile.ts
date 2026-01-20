import postgres from 'postgres';

export async function addAssessmentSourceAndLexile() {
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const host = process.env.PGHOST || 'localhost';
  const database = process.env.PGDATABASE || 'postgres';
  const port = parseInt(process.env.PGPORT || '5432');
  
  const encodedPassword = encodeURIComponent(password);
  const connectionString = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
  
  console.log('Running migration: Adding source, lexile_score, session_id to student_assessments...');
  
  const sql = postgres(connectionString, { ssl: 'require', max: 1 });

  try {
    // Create enum type for assessment source
    await sql`
      DO $$ BEGIN
        CREATE TYPE assessment_source AS ENUM ('manual_entry', 'in_app');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    console.log('✅ Created assessment_source enum type');

    // Add source column
    await sql`
      ALTER TABLE student_assessments 
      ADD COLUMN IF NOT EXISTS source assessment_source NOT NULL DEFAULT 'manual_entry'
    `;
    console.log('✅ Added source column');

    // Add lexile_score column
    await sql`
      ALTER TABLE student_assessments 
      ADD COLUMN IF NOT EXISTS lexile_score INTEGER
    `;
    console.log('✅ Added lexile_score column');

    // Add session_id column
    await sql`
      ALTER TABLE student_assessments 
      ADD COLUMN IF NOT EXISTS session_id INTEGER
    `;
    console.log('✅ Added session_id column');

    // Create assessment_sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS assessment_sessions (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        assessment_type_id INTEGER NOT NULL REFERENCES assessment_types(id),
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'in_progress',
        total_questions INTEGER,
        correct_answers INTEGER,
        time_spent_seconds INTEGER,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Created assessment_sessions table');

    // Create indexes for assessment_sessions
    await sql`
      CREATE INDEX IF NOT EXISTS idx_assessment_sessions_school ON assessment_sessions(school_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_assessment_sessions_child ON assessment_sessions(child_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_assessment_sessions_type ON assessment_sessions(assessment_type_id)
    `;
    console.log('✅ Created indexes for assessment_sessions');

    // Add foreign key constraint for session_id after table exists
    await sql`
      DO $$ BEGIN
        ALTER TABLE student_assessments 
        ADD CONSTRAINT fk_student_assessments_session
        FOREIGN KEY (session_id) REFERENCES assessment_sessions(id);
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    console.log('✅ Added foreign key constraint for session_id');

    await sql.end();
    console.log('✅ Migration completed: assessment source and lexile fields added');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await sql.end();
    throw error;
  }
}
