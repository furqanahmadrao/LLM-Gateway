-- Migration: 005_custom_providers
-- Description: Add custom OpenAI-compatible provider support
-- Requirements: 2.1, 2.2, 2.3, 2.4, 2.5 - Allow custom providers with configurable base URL, auth headers, and API paths

-- Add is_custom column to providers table to distinguish custom providers
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

-- Add custom_config JSONB column for custom provider configuration
-- Schema:
-- {
--   "baseUrl": "https://api.custom.com",
--   "authHeaderName": "Authorization",
--   "authValueTemplate": "Bearer ${API_KEY}",
--   "apiVersion": "2024-01-01",
--   "modelsPath": "/v1/models",
--   "chatCompletionsPath": "/v1/chat/completions",
--   "embeddingsPath": "/v1/embeddings"
-- }
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS custom_config JSONB;

-- Index for efficient lookup of custom providers
CREATE INDEX IF NOT EXISTS idx_providers_is_custom 
ON providers(is_custom) WHERE is_custom = true;

-- Add constraint to ensure custom providers have custom_config
ALTER TABLE providers
ADD CONSTRAINT providers_custom_config_check
CHECK (
  (is_custom = false) OR 
  (is_custom = true AND custom_config IS NOT NULL AND custom_config->>'baseUrl' IS NOT NULL)
);
