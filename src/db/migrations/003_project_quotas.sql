-- Migration: 003_project_quotas
-- Description: Add token quota tracking to projects

-- Add quota columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS token_quota BIGINT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMP;

-- Index for quota queries
CREATE INDEX IF NOT EXISTS idx_projects_quota ON projects(token_quota, tokens_used);
