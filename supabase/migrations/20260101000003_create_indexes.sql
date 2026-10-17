-- ============================================================================
-- HireMatch Migration 003: Indexes (HNSW, GIN, B-Tree)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HNSW VECTOR INDEX (Hierarchical Navigable Small World)
--
-- Non-obvious / Interview Explanation:
-- - Why HNSW over IVFFlat?
--   IVFFlat partitions the vector space into Voronoi cells. It requires an
--   upfront clustering training phase (cannot index empty tables) and recall drops
--   significantly if dataset distributions drift. HNSW builds a multi-layer graph
--   incrementally upon every INSERT, providing >99% recall without needing any
--   training step.
-- - Parameters:
--   m = 16: Max bidirectional connections per node. 16 is optimal for 1536-dim vectors.
--   ef_construction = 64: Size of the dynamic candidate list during index build.
--   Higher values increase build time but improve recall accuracy.
-- - Operator Class:
--   vector_cosine_ops: Uses cosine distance (<=> operator), where distance = 1 - cosine_similarity.
--   Crucial because text embeddings are normalized to unit sphere.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_embeddings_hnsw_cosine
ON public.job_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Optional HNSW index on candidate resumes for candidate discovery / recruiter reverse matching
CREATE INDEX IF NOT EXISTS idx_resumes_hnsw_cosine
ON public.resumes
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------------------
-- 2. GIN FULL-TEXT SEARCH INDEX (Generalized Inverted Index)
--
-- Non-obvious / Interview Explanation:
-- - Why GIN over GiST for full-text search?
--   A GIN index creates an inverted list of every distinct lexeme (stemmed word)
--   pointing to row IDs containing that lexeme. Lookup time is O(1) per search term,
--   making read queries exceptionally fast. While GIN updates are slower than GiST,
--   job descriptions are read far more frequently than they are updated (read-heavy OLTP).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_search_vector_gin
ON public.jobs
USING gin (search_vector);

-- Trigram index on job title and company for autocomplete and fuzzy matching
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm
ON public.jobs
USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jobs_company_trgm
ON public.jobs
USING gin (company gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. B-TREE RELATIONAL & COMPOSITE FILTER INDEXES
--
-- High-frequency query acceleration for pagination and tenant-scoped lookups.
-- ----------------------------------------------------------------------------

-- Filter active jobs sorted by date (used by public job feed)
CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at
ON public.jobs (status, created_at DESC);

-- Lookup all resumes for a student
CREATE INDEX IF NOT EXISTS idx_resumes_user_id_status
ON public.resumes (user_id, status, created_at DESC);

-- Top-K matches query: Instant retrieval of precomputed matches ordered by RRF score
-- Interview Explanation: Compound index (resume_id, rrf_score DESC) eliminates sorting overhead.
CREATE INDEX IF NOT EXISTS idx_matches_resume_rrf
ON public.matches (resume_id, rrf_score DESC);

CREATE INDEX IF NOT EXISTS idx_matches_user_id
ON public.matches (user_id);

-- Check existing applications and list candidate applications
CREATE INDEX IF NOT EXISTS idx_applications_user_id
ON public.applications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_job_id
ON public.applications (job_id, status);
