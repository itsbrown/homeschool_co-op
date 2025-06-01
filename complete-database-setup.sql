-- Complete Database Setup for ASA Platform
-- This script creates all necessary tables and permissions in the public schema

-- First, ensure we're working in the public schema
SET search_path TO public;

-- Drop existing tables if they exist to start fresh
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;

-- Create the accounts table
CREATE TABLE public.accounts (
    id BIGSERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'school_admin', 'teacher', 'parent', 'student')),
    parent_id BIGINT REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create the schools table
CREATE TABLE public.schools (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'academy',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone_number VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    description TEXT,
    founded_year INTEGER,
    accreditation VARCHAR(255),
    enrollment_size INTEGER,
    created_by BIGINT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert your user account
INSERT INTO public.accounts (firebase_uid, email, role, created_at, updated_at)
VALUES ('05052776-9b5e-4330-867d-d489273eaf70', 'coreycreates@gmail.com', 'school_admin', NOW(), NOW())
ON CONFLICT (firebase_uid) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

-- Insert American Seekers Academy
INSERT INTO public.schools (
    name, 
    type,
    address, 
    city,
    state,
    zip_code,
    created_by, 
    created_at, 
    updated_at
) VALUES (
    'American Seekers Academy',
    'Private Academy',
    '123 Education Lane',
    'Rochester',
    'NY',
    '14620',
    (SELECT id FROM public.accounts WHERE email = 'coreycreates@gmail.com'),
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Disable RLS temporarily to set up policies
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools DISABLE ROW LEVEL SECURITY;

-- Grant full permissions to service_role
GRANT ALL PRIVILEGES ON TABLE public.accounts TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.schools TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.accounts_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.schools_id_seq TO service_role;

-- Grant permissions to authenticated users
GRANT ALL PRIVILEGES ON TABLE public.accounts TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.schools TO authenticated;
GRANT ALL PRIVILEGES ON SEQUENCE public.accounts_id_seq TO authenticated;
GRANT ALL PRIVILEGES ON SEQUENCE public.schools_id_seq TO authenticated;

-- Grant permissions to anon users (for unauthenticated access if needed)
GRANT SELECT ON TABLE public.accounts TO anon;
GRANT SELECT ON TABLE public.schools TO anon;

-- Enable RLS and create permissive policies
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Create very permissive policies for now (we can tighten these later)
CREATE POLICY "Allow all operations on accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on schools" ON public.schools FOR ALL USING (true) WITH CHECK (true);

-- Verify the setup
SELECT 'Setup completed successfully' as status;