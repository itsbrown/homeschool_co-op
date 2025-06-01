-- Fix Supabase Permissions and Create Tables
-- Run this in your Supabase SQL Editor

-- First, ensure we're working in the public schema
SET search_path TO public;

-- Grant all necessary permissions to the service role
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- Drop existing tables if they exist (to start fresh)
DROP TABLE IF EXISTS public.role_invitations CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;

-- Create accounts table
CREATE TABLE public.accounts (
    id BIGSERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'educator', 'school_admin', 'platform_admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create schools table
CREATE TABLE public.schools (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
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
    created_by BIGINT REFERENCES public.accounts(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create role_invitations table
CREATE TABLE public.role_invitations (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'educator', 'school_admin', 'platform_admin')),
    token VARCHAR(255) UNIQUE NOT NULL,
    invited_by VARCHAR(255) NOT NULL,
    school_id BIGINT REFERENCES public.schools(id),
    is_active BOOLEAN DEFAULT true,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Disable RLS on all tables to allow service role access
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_invitations DISABLE ROW LEVEL SECURITY;

-- Grant specific permissions on tables
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.schools TO service_role;
GRANT ALL ON public.role_invitations TO service_role;

-- Grant permissions on sequences
GRANT ALL ON public.accounts_id_seq TO service_role;
GRANT ALL ON public.schools_id_seq TO service_role;
GRANT ALL ON public.role_invitations_id_seq TO service_role;

-- Create your initial school admin account
INSERT INTO public.accounts (firebase_uid, email, role, created_at, updated_at)
VALUES ('05052776-9b5e-4330-867d-d489273eaf70', 'coreycreates@gmail.com', 'school_admin', NOW(), NOW())
ON CONFLICT (firebase_uid) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

-- Create the American Seekers Academy school
INSERT INTO public.schools (
    name, 
    type, 
    address, 
    city, 
    state, 
    zip_code, 
    email, 
    created_by, 
    created_at, 
    updated_at
)
SELECT 
    'American Seekers Academy',
    'Private Academy',
    '123 Education Lane',
    'Rochester',
    'NY',
    '14620',
    'coreycreates@gmail.com',
    a.id,
    NOW(),
    NOW()
FROM public.accounts a 
WHERE a.email = 'coreycreates@gmail.com'
ON CONFLICT DO NOTHING;

-- Verify the setup
SELECT 'Accounts created:' as info, COUNT(*) as count FROM public.accounts;
SELECT 'Schools created:' as info, COUNT(*) as count FROM public.schools;
SELECT 'Tables accessible by service role' as status;