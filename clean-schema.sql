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

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner',
  name TEXT NOT NULL,
  avatar TEXT,
  subscription TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
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
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  age_range TEXT NOT NULL,
  grade_levels TEXT[] NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  schedule_type TEXT NOT NULL,
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

CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  transaction_id TEXT,
  discount_code TEXT,
  discount_amount INTEGER,
  total_paid INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE INDEX idx_children_parent_id ON children(parent_id);
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id);
CREATE INDEX idx_program_enrollments_program_id ON program_enrollments(program_id);
CREATE INDEX idx_program_enrollments_child_id ON program_enrollments(child_id);
CREATE INDEX idx_programs_instructor_id ON programs(instructor_id);
CREATE INDEX idx_schools_admin_id ON schools(admin_id);
CREATE INDEX idx_knowledge_bases_creator_id ON knowledge_bases(creator_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);