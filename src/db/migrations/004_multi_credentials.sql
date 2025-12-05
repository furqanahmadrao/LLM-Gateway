-- Migration: 004_multi_credentials
-- Description: Add multi-credential support for providers
-- Requirements: 1.1, 1.2 - Allow multiple credentials per provider type within a team

-- Remove unique constraint on (provider_id, team_id) to allow multiple credentials
ALTER TABLE provider_credentials 
DROP CONSTRAINT IF EXISTS provider_credentials_provider_id_team_id_key;

-- Add credential_name column for differentiation (default 'default' for existing rows)
ALTER TABLE provider_credentials 
ADD COLUMN IF NOT EXISTS credential_name VARCHAR(255) NOT NULL DEFAULT 'default';

-- Add new unique constraint on (provider_id, team_id, credential_name)
ALTER TABLE provider_credentials 
ADD CONSTRAINT provider_credentials_provider_team_name_key 
UNIQUE (provider_id, team_id, credential_name);

-- Add is_default column to mark the default credential for routing
ALTER TABLE provider_credentials 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Add priority column for routing order (lower = higher priority)
ALTER TABLE provider_credentials 
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Index for efficient credential lookup by team and provider
CREATE INDEX IF NOT EXISTS idx_provider_credentials_team_provider 
ON provider_credentials(team_id, provider_id, priority);
