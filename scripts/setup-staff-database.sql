-- Create school_staff table for storing staff information
CREATE TABLE IF NOT EXISTS school_staff (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  position TEXT NOT NULL,
  department TEXT,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert existing staff data from your current team
INSERT INTO school_staff (
  first_name, 
  last_name, 
  email, 
  position, 
  department, 
  start_date, 
  is_active,
  created_at
) VALUES 
  ('Corey', 'Brown', 'coreycreates@gmail.com', 'Support Staff', 'Technology', '2025-05-27', true, '2025-05-27T19:43:32.236Z'),
  ('Jocelyn', 'Brown', 'jocimarie@gmail.com', 'Mentor', 'Music', '2025-05-27', true, '2025-05-27T20:40:17.704Z'),
  ('Corey', 'Brown', 'corey.e.brown2025@gmail.com', 'Administrator', 'Arts', '2025-06-01', true, '2025-06-01T23:19:52.590Z')
ON CONFLICT (email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  position = EXCLUDED.position,
  department = EXCLUDED.department,
  updated_at = NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_school_staff_school_id ON school_staff(school_id);
CREATE INDEX IF NOT EXISTS idx_school_staff_email ON school_staff(email);
CREATE INDEX IF NOT EXISTS idx_school_staff_active ON school_staff(is_active);