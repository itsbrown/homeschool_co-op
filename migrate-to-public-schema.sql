-- Migration script to move tables from custom schemas to public schema
-- This resolves Supabase JavaScript client access issues

-- Step 1: Backup existing data
CREATE TABLE IF NOT EXISTS backup_users_accounts AS SELECT * FROM users.accounts;
CREATE TABLE IF NOT EXISTS backup_schools_schools AS SELECT * FROM schools.schools;
CREATE TABLE IF NOT EXISTS backup_schools_classes AS SELECT * FROM schools.classes;
CREATE TABLE IF NOT EXISTS backup_schools_enrollments AS SELECT schools.enrollments;

-- Step 2: Create tables in public schema
CREATE TABLE IF NOT EXISTS public.accounts (
    id SERIAL PRIMARY KEY,
    firebase_uid TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'school_admin', 'teacher', 'parent', 'student')),
    parent_id INTEGER REFERENCES public.accounts(id),
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.schools (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    created_by INTEGER REFERENCES public.accounts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES public.schools(id),
    program_type TEXT,
    title TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    days_of_week TEXT[],
    capacity INTEGER,
    enrollment_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.enrollments (
    id SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES public.classes(id),
    student_id INTEGER REFERENCES public.accounts(id),
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Migrate data if source tables exist
DO $$
BEGIN
    -- Migrate accounts
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'users' AND table_name = 'accounts') THEN
        INSERT INTO public.accounts (id, firebase_uid, email, role, parent_id, full_name, created_at, updated_at)
        SELECT id, firebase_uid, email, role, parent_id, full_name, created_at, updated_at
        FROM users.accounts
        ON CONFLICT (id) DO NOTHING;
        
        -- Update sequence
        SELECT setval('public.accounts_id_seq', COALESCE((SELECT MAX(id) FROM public.accounts), 1));
    END IF;

    -- Migrate schools
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'schools' AND table_name = 'schools') THEN
        INSERT INTO public.schools (id, name, address, created_by, created_at, updated_at)
        SELECT id, name, address, created_by, created_at, updated_at
        FROM schools.schools
        ON CONFLICT (id) DO NOTHING;
        
        -- Update sequence
        SELECT setval('public.schools_id_seq', COALESCE((SELECT MAX(id) FROM public.schools), 1));
    END IF;

    -- Migrate classes
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'schools' AND table_name = 'classes') THEN
        INSERT INTO public.classes (id, school_id, program_type, title, start_date, end_date, days_of_week, capacity, enrollment_count, created_at, updated_at)
        SELECT id, school_id, program_type, title, start_date, end_date, days_of_week, capacity, enrollment_count, created_at, updated_at
        FROM schools.classes
        ON CONFLICT (id) DO NOTHING;
        
        -- Update sequence
        SELECT setval('public.classes_id_seq', COALESCE((SELECT MAX(id) FROM public.classes), 1));
    END IF;

    -- Migrate enrollments
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'schools' AND table_name = 'enrollments') THEN
        INSERT INTO public.enrollments (id, class_id, student_id, enrolled_at, updated_at)
        SELECT id, class_id, student_id, enrolled_at, updated_at
        FROM schools.enrollments
        ON CONFLICT (id) DO NOTHING;
        
        -- Update sequence
        SELECT setval('public.enrollments_id_seq', COALESCE((SELECT MAX(id) FROM public.enrollments), 1));
    END IF;
END $$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_firebase_uid ON public.accounts(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_accounts_role ON public.accounts(role);
CREATE INDEX IF NOT EXISTS idx_schools_created_by ON public.schools(created_by);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);

-- Step 5: Enable RLS on public tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for public.accounts
DROP POLICY IF EXISTS accounts_read ON public.accounts;
CREATE POLICY accounts_read ON public.accounts
    FOR SELECT
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR id = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
    );

DROP POLICY IF EXISTS accounts_write ON public.accounts;
CREATE POLICY accounts_write ON public.accounts
    FOR ALL
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR id = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
    );

-- Step 7: Create RLS policies for public.schools
DROP POLICY IF EXISTS schools_read ON public.schools;
CREATE POLICY schools_read ON public.schools
    FOR SELECT
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
    );

DROP POLICY IF EXISTS schools_write ON public.schools;
CREATE POLICY schools_write ON public.schools
    FOR ALL
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
    );

-- Step 8: Create RLS policies for public.classes
DROP POLICY IF EXISTS classes_read ON public.classes;
CREATE POLICY classes_read ON public.classes
    FOR SELECT
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR school_id IN (SELECT id FROM public.schools WHERE created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)))
    );

DROP POLICY IF EXISTS classes_write ON public.classes;
CREATE POLICY classes_write ON public.classes
    FOR ALL
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR school_id IN (SELECT id FROM public.schools WHERE created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)))
    );

-- Step 9: Create RLS policies for public.enrollments
DROP POLICY IF EXISTS enrollments_read ON public.enrollments;
CREATE POLICY enrollments_read ON public.enrollments
    FOR SELECT
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR student_id = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
        OR class_id IN (
            SELECT c.id FROM public.classes c
            JOIN public.schools s ON c.school_id = s.id
            WHERE s.created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
        )
    );

DROP POLICY IF EXISTS enrollments_write ON public.enrollments;
CREATE POLICY enrollments_write ON public.enrollments
    FOR ALL
    USING (
        COALESCE((SELECT role FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text)) IN ('super_admin', 'admin'), FALSE)
        OR class_id IN (
            SELECT c.id FROM public.classes c
            JOIN public.schools s ON c.school_id = s.id
            WHERE s.created_by = (SELECT id FROM public.accounts WHERE firebase_uid = (SELECT auth.uid()::text))
        )
    );

-- Step 10: Grant permissions
GRANT ALL ON public.accounts TO authenticated;
GRANT ALL ON public.schools TO authenticated;
GRANT ALL ON public.classes TO authenticated;
GRANT ALL ON public.enrollments TO authenticated;

GRANT USAGE ON SEQUENCE public.accounts_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.schools_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.classes_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.enrollments_id_seq TO authenticated;

-- Step 11: Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_schools_updated_at ON public.schools;
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_classes_updated_at ON public.classes;
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_enrollments_updated_at ON public.enrollments;
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();