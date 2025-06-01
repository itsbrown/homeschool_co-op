-- Safe migration script that preserves existing data
-- Run this in your Supabase SQL Editor

-- Step 1: Create tables in public schema if they don't exist
CREATE TABLE IF NOT EXISTS public.accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL CHECK (email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'school_admin', 'teacher', 'parent', 'student')),
    parent_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.schools (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (created_by) REFERENCES public.accounts(id) ON DELETE SET NULL
);

-- Step 2: Create a test user account for your email
INSERT INTO public.accounts (firebase_uid, email, role, created_at, updated_at)
VALUES ('05052776-9b5e-4330-867d-d489273eaf70', 'coreycreates@gmail.com', 'school_admin', NOW(), NOW())
ON CONFLICT (firebase_uid) DO NOTHING;

-- Step 3: Create American Seekers Academy school
INSERT INTO public.schools (name, address, created_by, created_at, updated_at)
VALUES (
    'American Seekers Academy', 
    'Monroe County, NY', 
    (SELECT id FROM public.accounts WHERE email = 'coreycreates@gmail.com'), 
    NOW(), 
    NOW()
)
ON CONFLICT DO NOTHING;

-- Step 4: Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Step 5: Create simplified RLS policies
CREATE POLICY accounts_all ON public.accounts FOR ALL USING (true);
CREATE POLICY schools_all ON public.schools FOR ALL USING (true);

-- Step 6: Grant permissions
GRANT ALL ON public.accounts TO authenticated;
GRANT ALL ON public.schools TO authenticated;
GRANT ALL ON public.accounts TO anon;
GRANT ALL ON public.schools TO anon;
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.schools TO service_role;

-- Step 7: Grant sequence permissions
GRANT USAGE ON SEQUENCE public.accounts_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.schools_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.accounts_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.schools_id_seq TO service_role;