-- ============================================================================
-- HireMatch Migration 004: Row-Level Security (RLS) Policies
-- ============================================================================
--
-- Non-obvious / Interview Explanation:
-- 1. Why Row-Level Security (RLS)?
--    In a modern multi-tenant SaaS application, application bugs (e.g. omitting
--    "WHERE user_id = ?" in Express or Prisma) are the #1 source of data leaks.
--    By enforcing RLS in the PostgreSQL engine, the database automatically appends
--    security predicates to every query executed under an authenticated context.
-- 2. How Supabase RLS works:
--    When a request comes from a client, Supabase sets `auth.uid()` from the verified
--    JWT payload. `auth.uid() = user_id` guarantees that queries can never read
--    or modify rows outside the authenticated caller's tenant scope.
-- 3. How Background Workers Bypass RLS:
--    The asynchronous BullMQ worker uses the Supabase `service_role` key, which
--    carries `bypassrls` privileges in Postgres, allowing it to parse resumes,
--    insert embeddings, and write computed matches across any user.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE RLS ON ALL TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. POLICIES: USERS TABLE
-- ----------------------------------------------------------------------------
-- Users can inspect their own user record
CREATE POLICY "Users can read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own user record (e.g., name, avatar)
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 3. POLICIES: RESUMES TABLE
-- Strict privacy: Resumes contain sensitive candidate career history and PII.
-- Only the owner (auth.uid() = user_id) can view, upload, or delete their resume.
-- ----------------------------------------------------------------------------
CREATE POLICY "Students can read own resumes"
ON public.resumes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own resumes"
ON public.resumes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update own resumes"
ON public.resumes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can delete own resumes"
ON public.resumes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. POLICIES: JOBS TABLE
-- Job postings are public for discovery by any anonymous or authenticated visitor.
-- Only recruiters and admins can create, modify, or archive job postings.
-- ----------------------------------------------------------------------------
-- Public read access for active jobs (Next.js SSR job catalog)
CREATE POLICY "Active jobs are readable by all"
ON public.jobs
FOR SELECT
TO public
USING (status = 'active');

-- Recruiters and admins can read all jobs including drafts
CREATE POLICY "Recruiters and admins can read all jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
);

-- Recruiters and admins can insert new jobs
CREATE POLICY "Recruiters and admins can insert jobs"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
);

-- Recruiters and admins can update jobs
CREATE POLICY "Recruiters and admins can update jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
);

-- ----------------------------------------------------------------------------
-- 5. POLICIES: JOB_EMBEDDINGS TABLE
-- Embeddings are used for similarity search against active jobs.
-- ----------------------------------------------------------------------------
CREATE POLICY "Job embeddings are readable for active jobs"
ON public.job_embeddings
FOR SELECT
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id = job_embeddings.job_id AND jobs.status = 'active'
    )
);

-- ----------------------------------------------------------------------------
-- 6. POLICIES: MATCHES TABLE
-- Strict candidate privacy: Matches and LLM gap analyses must ONLY be visible
-- to the student who owns the corresponding resume.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can only read their own matches"
ON public.matches
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches"
ON public.matches
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7. POLICIES: APPLICATIONS TABLE
-- Candidates can view and track their own applications.
-- Recruiters can view all applications submitted for jobs they oversee.
-- ----------------------------------------------------------------------------
CREATE POLICY "Candidates can read own applications"
ON public.applications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Candidates can submit applications"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Recruiters can read all applications"
ON public.applications
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
);

CREATE POLICY "Recruiters can update application statuses"
ON public.applications
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('recruiter', 'admin')
    )
);
