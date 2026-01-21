-- Create profiles table for storing user information
-- This table stores data that auth.users doesn't provide (full name, etc.)

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read and write their own profile
CREATE POLICY "Users can manage own profile"
  ON profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Index for fast lookups by phone number (if needed)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone_number);

-- Comment for documentation
COMMENT ON TABLE profiles IS 'User profile information including full name and phone number';
COMMENT ON COLUMN profiles.full_name IS 'User full name for personalization';
COMMENT ON COLUMN profiles.phone_number IS 'User phone number in E.164 format';
COMMENT ON COLUMN profiles.last_called_at IS 'Timestamp of last Twilio call for this user';
COMMENT ON COLUMN profiles.retry_count IS 'Number of call retry attempts';
