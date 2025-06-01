-- Migration script to set up users and role invitations tables in Supabase

-- Create users table (extending Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'educator', 'admin', 'schoolAdmin', 'superAdmin')),
  avatar TEXT,
  subscription TEXT DEFAULT 'free' CHECK (subscription IN ('free', 'family', 'educator', 'premium')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create role invitations table
CREATE TABLE IF NOT EXISTS public.role_invitations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent', 'educator', 'admin', 'schoolAdmin', 'superAdmin')),
  token TEXT UNIQUE NOT NULL,
  invited_by TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(email, is_active) -- Only one active invitation per email
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_role_invitations_token ON public.role_invitations(token);
CREATE INDEX IF NOT EXISTS idx_role_invitations_email ON public.role_invitations(email);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_invitations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() 
      AND role IN ('admin', 'superAdmin')
    )
  );

-- Create RLS policies for role invitations
CREATE POLICY "Admins can manage role invitations" ON public.role_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() 
      AND role IN ('admin', 'superAdmin', 'schoolAdmin')
    )
  );

-- Insert your super admin user
INSERT INTO public.users (
  name, 
  username, 
  email, 
  role, 
  subscription
) VALUES (
  'Super Administrator',
  'contact@americanseekersacademy.com',
  'contact@americanseekersacademy.com',
  'superAdmin',
  'premium'
) ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  subscription = EXCLUDED.subscription;

-- Function to automatically create user profile when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, name, username, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    new.email,
    'parent' -- default role
  );
  RETURN new;
END;
$$;

-- Trigger to call the function when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.role_invitations TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;