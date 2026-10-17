-- ============================================================================
-- HireMatch Migration 001: Extensions
-- ============================================================================
-- Enable pgvector for high-dimensional vector similarity search (embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pgcrypto for cryptographic functions and UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_trgm for trigram-based fuzzy string search and acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;
