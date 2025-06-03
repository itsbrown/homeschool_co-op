-- Complete Supabase Database Setup
-- Run this SQL in your Supabase SQL Editor to create all tables with proper RLS policies

-- Drop existing tables if they exist (for fresh start)
DROP TABLE IF EXISTS program_enrollments CASCADE;
DROP TABLE IF EXISTS school_class_enrollments CASCADE;
DROP TABLE IF EXISTS school_students CASCADE;
DROP TABLE IF EXISTS school_staff CASCADE;
DROP TABLE IF EXISTS school_classes CASCADE;
DROP TABLE IF EXISTS children CASCADE;
DROP TABLE IF EXISTS emergency_contacts CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
DROP TABLE IF EXISTS knowledge_bases CASCADE;
DROP TABLE IF EXISTS curricula CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'parent', 'educator', 'admin', 'schoolAdmin')),
  name TEXT NOT NULL,
  avatar TEXT,
  subscription TEXT NOT NULL DEFAULT 'free' CHECK (subscription IN ('free', 'individual', 'family', 'educator', 'institutional')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  supabase_id TEXT, -- Add supabase_id to store the user's UUID from Supabase Auth
  school_id INTEGER -- Will reference schools(id) after schools table is created
);

-- Create schools table
CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('school', 'co-op', 'homeschool_group', 'other')),
  admin_id INTEGER NOT NULL REFERENCES users(id),
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  description TEXT,
  logo TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for users.school_id
ALTER TABLE users ADD CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES schools(id);

-- Create children table with parent_email column
CREATE TABLE children (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_email TEXT NOT NULL, -- Add this column for querying by email
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birthdate DATE NOT NULL,
  grade_level TEXT NOT NULL,
  school TEXT,
  learning_style TEXT,
  special_needs TEXT,
  interests TEXT[],
  allergies TEXT,
  medical_info TEXT,
  profile_image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create emergency_contacts table
CREATE TABLE emergency_contacts (
  id SERIAL PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create programs table
CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  school_id INTEGER REFERENCES schools(id),
  instructor_id INTEGER REFERENCES users(id),
  age_range TEXT,
  schedule TEXT,
  price DECIMAL(10,2),
  max_students INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create classes table
CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  description TEXT,
  instructor_name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  location TEXT,
  max_students INTEGER NOT NULL DEFAULT 20,
  price DECIMAL(10,2) NOT NULL,
  school_id INTEGER REFERENCES schools(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create program_enrollments table
CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'completed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create curricula table
CREATE TABLE curricula (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create lessons table
CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  curriculum_id INTEGER NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  objectives TEXT[],
  materials TEXT[],
  duration_minutes INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create knowledge_bases table
CREATE TABLE knowledge_bases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  tags TEXT[],
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  download_count INTEGER NOT NULL DEFAULT 0,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

-- RLS Policies for children table
CREATE POLICY "Parents can view their own children" ON children
    FOR SELECT USING (
        parent_email = auth.jwt() ->> 'email'
    );

CREATE POLICY "Parents can insert their own children" ON children
    FOR INSERT WITH CHECK (
        parent_email = auth.jwt() ->> 'email'
    );

CREATE POLICY "Parents can update their own children" ON children
    FOR UPDATE USING (
        parent_email = auth.jwt() ->> 'email'
    );

CREATE POLICY "Parents can delete their own children" ON children
    FOR DELETE USING (
        parent_email = auth.jwt() ->> 'email'
    );

-- RLS Policies for emergency_contacts table
CREATE POLICY "Parents can view emergency contacts for their children" ON emergency_contacts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM children 
            WHERE children.id = emergency_contacts.child_id 
            AND children.parent_email = auth.jwt() ->> 'email'
        )
    );

-- RLS Policies for program_enrollments table
CREATE POLICY "Parents can view enrollments for their children" ON program_enrollments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM children 
            WHERE children.id = program_enrollments.child_id 
            AND children.parent_email = auth.jwt() ->> 'email'
        )
    );

-- RLS Policies for schools table (allow public read for basic info)
CREATE POLICY "Schools are publicly viewable" ON schools
    FOR SELECT USING (true);

-- RLS Policies for programs table (allow public read)
CREATE POLICY "Programs are publicly viewable" ON programs
    FOR SELECT USING (true);

-- RLS Policies for classes table (allow public read)
CREATE POLICY "Classes are publicly viewable" ON classes
    FOR SELECT USING (true);

-- RLS Policies for curricula table (allow public read for public curricula)
CREATE POLICY "Public curricula are viewable" ON curricula
    FOR SELECT USING (is_public = true OR author_id = (auth.jwt() ->> 'user_id')::integer);

-- RLS Policies for lessons table
CREATE POLICY "Lessons are viewable if curriculum is accessible" ON lessons
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM curricula 
            WHERE curricula.id = lessons.curriculum_id 
            AND (curricula.is_public = true OR curricula.author_id = (auth.jwt() ->> 'user_id')::integer)
        )
    );

-- RLS Policies for knowledge_bases table
CREATE POLICY "Public knowledge bases are viewable" ON knowledge_bases
    FOR SELECT USING (is_public = true OR author_id = (auth.jwt() ->> 'user_id')::integer);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON emergency_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON program_enrollments TO authenticated;
GRANT SELECT ON schools TO authenticated;
GRANT SELECT ON programs TO authenticated;
GRANT SELECT ON classes TO authenticated;
GRANT SELECT ON curricula TO authenticated;
GRANT SELECT ON lessons TO authenticated;
GRANT SELECT ON knowledge_bases TO authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;