-- Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to create all tables

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
  school_id INTEGER REFERENCES schools(id) -- Add school_id for school admins and staff
);

-- Create children table
CREATE TABLE children (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Create schools table
CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('school', 'co-op', 'homeschool_group', 'other')),
  admin_id INTEGER NOT NULL REFERENCES users(id),
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  phone_number TEXT,
  email TEXT NOT NULL,
  website TEXT,
  logo TEXT,
  description TEXT,
  founded_year INTEGER,
  accreditation TEXT,
  enrollment_size INTEGER,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create emergency_contacts table
CREATE TABLE emergency_contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  is_authorized_pickup BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create programs table
CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('academic', 'enrichment', 'summer-camp', 'workshop', 'course', 'other')),
  age_range TEXT NOT NULL,
  grade_levels TEXT[] NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('one-time', 'recurring', 'flexible')),
  schedule_details JSONB NOT NULL,
  location_name TEXT,
  location_address TEXT,
  is_virtual BOOLEAN DEFAULT FALSE,
  meeting_url TEXT,
  capacity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  instructor_id INTEGER REFERENCES users(id),
  curriculum_id INTEGER,
  cover_image TEXT,
  materials JSONB,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create program_enrollments table
CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'cancelled', 'completed')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  payment_method TEXT CHECK (payment_method IN ('credit_card', 'paypal', 'bank_transfer', 'cash', 'scholarship')),
  transaction_id TEXT,
  discount_code TEXT,
  discount_amount INTEGER,
  total_paid INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create classes table (simplified for the platform)
CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  age_range TEXT,
  price INTEGER,
  instructor_name TEXT,
  location TEXT,
  schedule JSONB,
  capacity INTEGER,
  current_enrollment INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create knowledge_bases table
CREATE TABLE knowledge_bases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  grade_level TEXT,
  content JSONB NOT NULL,
  creator_id INTEGER REFERENCES users(id),
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create school_students table (for students affiliated with a school)
CREATE TABLE school_students (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  grade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated', 'transferred')),
  student_id TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create school_staff table (for teachers/staff of a school)
CREATE TABLE school_staff (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'administrator', 'staff', 'other')),
  position TEXT NOT NULL,
  department TEXT,
  start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create school_classes table (classes specific to schools)
CREATE TABLE school_classes (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id),
  academic_year TEXT NOT NULL,
  semester TEXT,
  schedule JSONB NOT NULL,
  location TEXT,
  max_enrollment INTEGER NOT NULL,
  current_enrollment INTEGER DEFAULT 0,
  curriculum_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create school_class_enrollments table
CREATE TABLE school_class_enrollments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES school_students(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'withdrawn', 'failed')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_children_parent_id ON children(parent_id);
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id);
CREATE INDEX idx_program_enrollments_program_id ON program_enrollments(program_id);
CREATE INDEX idx_program_enrollments_child_id ON program_enrollments(child_id);
CREATE INDEX idx_programs_instructor_id ON programs(instructor_id);
CREATE INDEX idx_schools_admin_id ON schools(admin_id);
CREATE INDEX idx_knowledge_bases_creator_id ON knowledge_bases(creator_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_school_students_school_id ON school_students(school_id);
CREATE INDEX idx_school_students_child_id ON school_students(child_id);
CREATE INDEX idx_school_staff_school_id ON school_staff(school_id);
CREATE INDEX idx_school_staff_user_id ON school_staff(user_id);
CREATE INDEX idx_school_classes_school_id ON school_classes(school_id);
CREATE INDEX idx_school_classes_teacher_id ON school_classes(teacher_id);
CREATE INDEX idx_school_class_enrollments_class_id ON school_class_enrollments(class_id);
CREATE INDEX idx_school_class_enrollments_student_id ON school_class_enrollments(student_id);

-- Supabase Role-Based Access Control Setup
-- Run this SQL in your Supabase SQL Editor

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_class_enrollments ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION auth.user_role() 
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM users 
    WHERE supabase_id = auth.uid()::text
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get current user's school
CREATE OR REPLACE FUNCTION auth.user_school_id() 
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT school_id 
    FROM users 
    WHERE supabase_id = auth.uid()::text
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users table policies
CREATE POLICY "Users can view own profile" ON users 
  FOR SELECT USING (supabase_id = auth.uid()::text);

CREATE POLICY "Users can update own profile" ON users 
  FOR UPDATE USING (supabase_id = auth.uid()::text);

CREATE POLICY "Admins can view all users" ON users 
  FOR SELECT USING (auth.user_role() IN ('admin', 'superAdmin'));

CREATE POLICY "School admins can view school users" ON users 
  FOR SELECT USING (
    auth.user_role() = 'schoolAdmin' AND 
    school_id = auth.user_school_id()
  );

-- Children table policies
CREATE POLICY "Parents can manage own children" ON children 
  FOR ALL USING (parent_id = (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  ));

CREATE POLICY "School staff can view school children" ON children 
  FOR SELECT USING (
    auth.user_role() IN ('teacher', 'schoolAdmin') AND
    EXISTS (
      SELECT 1 FROM school_students ss 
      JOIN users u ON u.id = ss.child_id 
      WHERE ss.child_id = children.id 
      AND u.school_id = auth.user_school_id()
    )
  );

-- Schools table policies
CREATE POLICY "Public can view published schools" ON schools 
  FOR SELECT USING (status = 'active');

CREATE POLICY "School admins can manage own school" ON schools 
  FOR ALL USING (admin_id = (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  ));

CREATE POLICY "Super admins can manage all schools" ON schools 
  FOR ALL USING (auth.user_role() = 'superAdmin');

-- Programs table policies
CREATE POLICY "Public can view published programs" ON programs 
  FOR SELECT USING (is_published = true);

CREATE POLICY "Instructors can manage own programs" ON programs 
  FOR ALL USING (instructor_id = (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  ));

CREATE POLICY "School staff can manage school programs" ON programs 
  FOR ALL USING (
    auth.user_role() IN ('schoolAdmin', 'teacher') AND
    instructor_id IN (
      SELECT id FROM users WHERE school_id = auth.user_school_id()
    )
  );

-- Knowledge bases table policies
CREATE POLICY "Public can view public knowledge bases" ON knowledge_bases 
  FOR SELECT USING (is_public = true);

CREATE POLICY "Authors can manage own knowledge bases" ON knowledge_bases 
  FOR ALL USING (creator_id = (
    SELECT id FROM users WHERE supabase_id = auth.uid()::text
  ));

CREATE POLICY "School staff can view school knowledge bases" ON knowledge_bases 
  FOR SELECT USING (
    auth.user_role() IN ('teacher', 'schoolAdmin') AND
    creator_id IN (
      SELECT id FROM users WHERE school_id = auth.user_school_id()
    )
  );

-- Classes table policies
CREATE POLICY "Public can view published classes" ON classes 
  FOR SELECT USING (is_active = true);

CREATE POLICY "Instructors can manage own classes" ON classes 
  FOR ALL USING (instructor_name = (
    SELECT name FROM users WHERE supabase_id = auth.uid()::text
  ));

CREATE POLICY "School admins can manage school classes" ON classes 
  FOR ALL USING (
    auth.user_role() = 'schoolAdmin' AND
    instructor_name IN (
      SELECT name FROM users WHERE school_id = auth.user_school_id()
    )
  );