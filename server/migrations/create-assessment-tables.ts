import postgres from 'postgres';

export async function createAssessmentTables() {
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const host = process.env.PGHOST || 'localhost';
  const database = process.env.PGDATABASE || 'postgres';
  const port = parseInt(process.env.PGPORT || '5432');
  
  const encodedPassword = encodeURIComponent(password);
  const connectionString = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
  
  console.log('🔄 Running assessment tables migration...');
  
  const sql = postgres(connectionString, { ssl: 'require', max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS assessment_types (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'custom',
        score_format TEXT NOT NULL DEFAULT 'numeric',
        max_score INTEGER,
        level_options TEXT[],
        has_curriculum_books BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT assessment_types_school_id_name_unique UNIQUE (school_id, name)
      )
    `;
    console.log('✅ Created assessment_types table');

    await sql`
      CREATE TABLE IF NOT EXISTS curriculum_books (
        id SERIAL PRIMARY KEY,
        assessment_type_id INTEGER NOT NULL REFERENCES assessment_types(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        total_lessons INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Created curriculum_books table');

    await sql`
      CREATE TABLE IF NOT EXISTS student_assessments (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        location_id INTEGER REFERENCES locations(id),
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        assessment_type_id INTEGER NOT NULL REFERENCES assessment_types(id),
        curriculum_book_id INTEGER REFERENCES curriculum_books(id),
        assessment_date TIMESTAMP NOT NULL,
        score TEXT NOT NULL,
        lesson INTEGER,
        notes TEXT,
        recorded_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Created student_assessments table');

    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_assessments_child ON student_assessments(child_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_assessments_school ON student_assessments(school_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_assessments_location ON student_assessments(location_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_assessments_type ON student_assessments(assessment_type_id)
    `;
    console.log('✅ Created indexes for student_assessments');

    await sql.end();
    console.log('✅ Migration completed: assessment tables created');
  } catch (error) {
    console.error('❌ Assessment tables migration failed:', error);
    await sql.end();
    throw error;
  }
}
