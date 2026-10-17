-- ============================================================================
-- HireMatch Migration 005: Hybrid Search SQL Function (Reciprocal Rank Fusion)
-- ============================================================================
--
-- Non-obvious / Interview Explanation:
-- 1. Why Hybrid Search?
--    - Dense vector search (pgvector HNSW) understands conceptual meaning
--      (e.g., "distributed systems" matches "microservices", "Kafka", "RPC"),
--      but frequently fails on exact keywords, acronyms, or specific tech stacks
--      ("Kubernetes v1.28", "PostgreSQL", specific certifications).
--    - Sparse keyword search (Postgres tsvector/GIN) excels at exact vocabulary
--      matching, but suffers from the vocabulary mismatch problem (fails if the
--      candidate writes "software developer" while the job posting says "backend engineer").
-- 2. Why Reciprocal Rank Fusion (RRF) with k=60?
--    - Combining raw vector cosine similarity (range [0, 1]) with full-text
--      ts_rank_cd (unbounded float, often [0.01, 0.4]) via weighted addition
--      requires fragile normalization constants that break across datasets.
--    - RRF (Cormack et al., SIGIR 2009) operates purely on ordinal ranks:
--      RRF_Score(d) = SUM( 1 / (k + rank_i(d)) )
--      The constant k (standard k=60) dampens the impact of high-ranking outliers
--      and stabilizes the combined rank score.
-- 3. In-Database Execution:
--    Computing RRF inside a single Postgres function eliminates multiple network
--    roundtrips between Express and PostgreSQL, allows index-accelerated CTEs,
--    and keeps pagination (LIMIT/OFFSET) within the database engine.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hybrid_search_jobs(
    query_text TEXT DEFAULT NULL,
    query_embedding vector(1536) DEFAULT NULL,
    match_count INT DEFAULT 10,
    offset_count INT DEFAULT 0,
    rrf_k INT DEFAULT 60,
    filter_job_type TEXT DEFAULT NULL,
    filter_experience_level TEXT DEFAULT NULL
)
RETURNS TABLE (
    job_id UUID,
    title TEXT,
    company TEXT,
    location TEXT,
    job_type TEXT,
    experience_level TEXT,
    description TEXT,
    requirements TEXT[],
    skills TEXT[],
    salary_min INT,
    salary_max INT,
    keyword_rank INT,
    vector_rank INT,
    rrf_score FLOAT8,
    vector_distance FLOAT8
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    parsed_query tsquery;
    has_text_query BOOLEAN := FALSE;
    has_vector_query BOOLEAN := FALSE;
BEGIN
    -- Check search modes
    IF query_text IS NOT NULL AND TRIM(query_text) <> '' THEN
        parsed_query := plainto_tsquery('english', query_text);
        has_text_query := TRUE;
    END IF;

    IF query_embedding IS NOT NULL THEN
        has_vector_query := TRUE;
    END IF;

    -- Return empty if neither query modality was provided
    IF NOT has_text_query AND NOT has_vector_query THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH
    -- 1. Full-text search candidate ranking
    text_candidates AS (
        SELECT
            j.id AS job_id,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(j.search_vector, parsed_query) DESC
            )::INT AS rank
        FROM public.jobs j
        WHERE
            has_text_query
            AND j.status = 'active'
            AND (filter_job_type IS NULL OR j.job_type = filter_job_type)
            AND (filter_experience_level IS NULL OR j.experience_level = filter_experience_level)
            AND j.search_vector @@ parsed_query
        LIMIT 100
    ),
    -- 2. Dense vector candidate ranking (using HNSW index with cosine distance <=>)
    vector_candidates AS (
        SELECT
            je.job_id AS job_id,
            ROW_NUMBER() OVER (
                ORDER BY je.embedding <=> query_embedding ASC
            )::INT AS rank,
            (je.embedding <=> query_embedding)::FLOAT8 AS distance
        FROM public.job_embeddings je
        JOIN public.jobs j ON j.id = je.job_id
        WHERE
            has_vector_query
            AND j.status = 'active'
            AND (filter_job_type IS NULL OR j.job_type = filter_job_type)
            AND (filter_experience_level IS NULL OR j.experience_level = filter_experience_level)
        ORDER BY je.embedding <=> query_embedding ASC
        LIMIT 100
    ),
    -- 3. Reciprocal Rank Fusion (RRF)
    all_candidates AS (
        SELECT COALESCE(t.job_id, v.job_id) AS job_id,
               t.rank AS text_rank,
               v.rank AS vector_rank,
               v.distance AS vector_dist,
               (
                   COALESCE(1.0 / (rrf_k + t.rank), 0.0) +
                   COALESCE(1.0 / (rrf_k + v.rank), 0.0)
               )::FLOAT8 AS rrf
        FROM text_candidates t
        FULL OUTER JOIN vector_candidates v ON t.job_id = v.job_id
    )
    SELECT
        j.id AS job_id,
        j.title,
        j.company,
        j.location,
        j.job_type,
        j.experience_level,
        j.description,
        j.requirements,
        j.skills,
        j.salary_min,
        j.salary_max,
        c.text_rank AS keyword_rank,
        c.vector_rank AS vector_rank,
        c.rrf AS rrf_score,
        c.vector_dist AS vector_distance
    FROM all_candidates c
    JOIN public.jobs j ON j.id = c.job_id
    ORDER BY c.rrf DESC
    LIMIT match_count
    OFFSET offset_count;
END;
$$;
