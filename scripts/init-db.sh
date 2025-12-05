#!/bin/bash
# Database initialization script for LLM Gateway
# This script runs during PostgreSQL container initialization

set -e

echo "=== LLM Gateway Database Initialization ==="

# Create extensions if needed
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Enable pgcrypto for additional crypto functions
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    GRANT ALL PRIVILEGES ON DATABASE gateway TO gateway;
EOSQL

echo "=== Database extensions created ==="
echo "=== Database initialization complete ==="
