-- Migration: 006_auth_schema
-- Description: Add users, sessions, and organizations tables

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions for auth
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Organizations (Top level)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- owner, admin, member
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Link Teams to Organizations
-- Note: We are modifying existing table 'teams'
ALTER TABLE teams ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- If we have existing teams, we might need a default org or handle nulls. 
-- For now, we allow nulls but in strict mode we would enforce it.

-- Update team_members to link to real users
-- First, drop the old constraint if it existed (it didn't reference a users table before)
-- We need to migrate data if this was a production app, but for this "fix" we assume fresh start or compatible change.
-- Since the old table had 'user_id' as UUID but no FK, we can now add the FK.
-- CAUTION: If existing user_ids don't exist in 'users', this will fail. 
-- For a clean fix, we will allow the FK to be added later or we assume empty DB for now as per user complaint "DB never stored data".
