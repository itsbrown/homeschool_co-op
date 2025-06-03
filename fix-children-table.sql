-- Fix children table to add missing parent_email column and proper RLS policies

-- Add parent_email column to children table
ALTER TABLE children ADD COLUMN IF NOT EXISTS parent_email TEXT;

-- Update existing records to populate parent_email from users table
UPDATE children 
SET parent_email = users.email 
FROM users 
WHERE children.parent_id = users.id 
AND children.parent_email IS NULL;

-- Enable RLS on children table
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for parents to see only their own children
CREATE POLICY "Parents can view their own children" ON children
    FOR SELECT USING (
        parent_email = auth.jwt() ->> 'email'
    );

-- Create RLS policy for parents to insert their own children
CREATE POLICY "Parents can insert their own children" ON children
    FOR INSERT WITH CHECK (
        parent_email = auth.jwt() ->> 'email'
    );

-- Create RLS policy for parents to update their own children
CREATE POLICY "Parents can update their own children" ON children
    FOR UPDATE USING (
        parent_email = auth.jwt() ->> 'email'
    );

-- Create RLS policy for parents to delete their own children
CREATE POLICY "Parents can delete their own children" ON children
    FOR DELETE USING (
        parent_email = auth.jwt() ->> 'email'
    );

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE children_id_seq TO authenticated;