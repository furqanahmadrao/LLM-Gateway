-- Migration: 002_models_and_keys
-- Description: Create models, aliases, and API keys tables

-- Cached models from providers
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_model_id VARCHAR(255) NOT NULL,
  unified_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  context_length INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, provider_model_id)
);

-- Model aliases per team
CREATE TABLE IF NOT EXISTS model_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, alias)
);

-- API keys for projects
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(8) NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP
);

-- Usage logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  model_id UUID REFERENCES models(id),
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_project_created ON usage_logs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_provider_created ON usage_logs(provider_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_models_unified_id ON models(unified_id);
CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(alias);
