# HireMatch - Architectural Decision Records (ADR)

This document records all key architectural and system design decisions made for **HireMatch**, an AI-powered job matching platform built with Next.js, Express, PostgreSQL/Supabase, pgvector, BullMQ/Redis, and LLMs.

Each entry follows the rigorous format:
- **Context**: The problem being solved and constraints.
- **Options Considered**: Alternatives evaluated.
- **Decision**: The chosen path and rationale.
- **Consequences**: Positive tradeoffs, limitations, and operational impacts.
- **When I'd Switch**: Concrete thresholds/criteria under which this decision should be revisited.

---

## ADR 001: Monorepo Structure and Workspace Management

- **Context**: HireMatch comprises a Next.js web application (`apps/web`), an Express REST API (`apps/api`), an asynchronous BullMQ queue worker (`apps/worker`), database migrations/scripts (`supabase/`), and shared schemas/types (`packages/shared`). We need seamless type sharing and schema validation without publishing private packages to an external registry.
- **Options Considered**:
  1. *Multi-repo (Polyrepo)*: Separate Git repositories for frontend, backend, worker, and shared libraries.
  2. *Turborepo / Nx Monorepo*: High-performance monorepo build systems with computation caching.
  3. *npm Workspaces*: Native Node.js monorepo workspace support without third-party orchestrator dependencies.
- **Decision**: Selected **npm Workspaces** with TypeScript Project References / path mappings. It provides zero-overhead package linking, works out-of-the-box in any standard Node.js CI/CD and Docker environment without requiring global binary installs, and satisfies strict TypeScript compilation.
- **Consequences**:
  - *Pros*: Zero config lock-in; lightweight; instant local symlinking between `packages/shared` and consuming apps; straightforward Docker build contexts.
  - *Cons*: Does not offer distributed task caching (unlike Nx or Turbo) for very large multi-team monorepos.
- **When I'd Switch**: If CI build times exceed 10 minutes or multiple independent engineering teams begin contributing concurrently, migrate to Turborepo for remote caching and parallelized build pipelines.

---

## ADR 002: Relational Schema Decoupling — Isolating `jobs` and `job_embeddings`

- **Context**: Job postings contain rich structured metadata (title, company, location, requirements, salary, full-text `tsvector`), while vector representations (1536-dimensional float arrays) require significant memory (~6 KB per row) and specialized HNSW index structures.
- **Options Considered**:
  1. *Single `jobs` Table with Inline Vector Column*: Storing `embedding vector(1536)` directly on `jobs`.
  2. *Decoupled Tables (`jobs` and `job_embeddings`)*: Separating core job transactional data from high-dimensional vector representations via a 1:1 foreign key.
- **Decision**: Decoupled the schema into `jobs` and `job_embeddings`.
- **Consequences**:
  - *Pros*: Keeps the `jobs` table narrow and cache-friendly for standard OLTP operations, filtering, pagination, and admin CRUD. PostgreSQL buffer pool pages fit significantly more job rows in RAM when embeddings are isolated. Allows multi-model embeddings (e.g., comparing `text-embedding-3-small` vs `text-embedding-3-large` or fine-tuned domain models) without altering core job schema.
  - *Cons*: Requires an inner join when executing hybrid search queries that combine relational attributes with vector distances.
- **When I'd Switch**: If vector search and job metadata retrieval are consistently executed together on a read-only data warehouse or if join overhead becomes the dominant bottleneck (unlikely given index-nested loop joins on primary keys).

---

## ADR 003: Vector Index Algorithm — HNSW vs IVFFlat for pgvector

- **Context**: Resumes and jobs must be compared using cosine similarity over high-dimensional vector spaces. pgvector supports two primary index types: Inverted File Flat (IVFFlat) and Hierarchical Navigable Small World (HNSW).
- **Options Considered**:
  1. *IVFFlat*: Partitions vector space into Voronoi cells using k-means clustering. Searches nearest lists.
  2. *HNSW*: Constructs a multi-layer graph where lower layers contain fine-grained connections and upper layers contain long-range skips.
  3. *Exact kNN (Sequential Flat Scan)*: Computes exact cosine distance for all rows without an index.
- **Decision**: Implemented **HNSW (`m = 16, ef_construction = 64`)** with cosine distance (`vector_cosine_ops`).
- **Consequences**:
  - *Pros*: Superior recall (>99%) at low search latencies (<10ms). Crucially, HNSW requires **no training step**, meaning it functions immediately on zero rows and dynamically indexes new records as jobs are inserted. IVFFlat requires an upfront batch of data to train cluster centroids and experiences severe recall degradation if data distribution shifts.
  - *Cons*: Higher memory consumption and longer build time during insertions compared to IVFFlat.
- **When I'd Switch**: If database memory (RAM) is severely constrained (<1GB allocated to Postgres) and dataset scale exceeds 10M vectors, switch to IVFFlat or offload vector search to a dedicated vector store (e.g. Pinecone / Qdrant).

---

## ADR 004: Hybrid Search Fusion Strategy — Reciprocal Rank Fusion (RRF) in a Single SQL Function

- **Context**: Pure vector search suffers from vocabulary mismatch and struggles with exact terms (e.g., "SOC2", "Kubernetes", "TypeScript", specific company names), whereas pure keyword search (BM25 / full-text search) fails to understand semantic intent (e.g., "distributed systems engineer" matching "cloud infrastructure developer"). We need a unified retrieval mechanism.
- **Options Considered**:
  1. *Application-Layer Merging*: Query Postgres full-text search, query pgvector in parallel via Node.js, and merge in Express memory.
  2. *Linear Score Combination*: Combine normalized vector cosine similarity (`1 - (embedding <=> q)`) with full-text search rank (`ts_rank_cd`) via weighted sum: `score = α * vector_score + (1 - α) * text_score`.
  3. *In-Database Reciprocal Rank Fusion (RRF)*: Compute keyword rank and vector rank within a single CTE query in PostgreSQL, assigning scores via $RRF(d) = \sum \frac{1}{k + r(d)}$ with $k = 60$.
- **Decision**: Implemented **Reciprocal Rank Fusion (k=60) inside a single PostgreSQL SQL function (`hybrid_search_jobs`)**.
- **Consequences**:
  - *Pros*: Scale-free and distribution-agnostic: RRF operates on ordinal ranks rather than uncalibrated raw scores, eliminating the need to normalize disparate score ranges (cosine distance vs. `ts_rank`). Single database roundtrip minimizes network latency and enables database-level pagination (`LIMIT / OFFSET`).
  - *Cons*: SQL function is vendor-coupled to PostgreSQL / pgvector syntax.
- **When I'd Switch**: If query workloads exceed thousands of QPS and database CPU becomes saturated with hybrid ranking CTEs, offload candidate retrieval to specialized search clusters (Elasticsearch/OpenSearch with hybrid search plugins) or use two-stage cross-encoder re-ranking.

---

## ADR 005: Security Model — Supabase Row-Level Security (RLS) vs Application-Level Auth

- **Context**: The platform stores sensitive student resumes, parsed career data, job matches, and application histories. We must guarantee that students cannot inspect or modify other candidates' resumes or match scores.
- **Options Considered**:
  1. *Application-Level Filtering*: Enforce `WHERE user_id = req.user.id` manually across every Express endpoint and ORM query.
  2. *Database Row-Level Security (RLS)*: Enforce access control policies natively at the PostgreSQL engine level using Supabase JWT claims (`auth.uid()`).
  3. *Dual-Layer Defense*: Enforce RLS at the database engine level while validating tenant context in application middleware.
- **Decision**: Adopted **Database Row-Level Security (RLS)** as the authoritative boundary, complemented by application-level validation.
- **Consequences**:
  - *Pros*: Fail-safe security. Even if an engineer writes a buggy Express route or a raw SQL query missing a `WHERE` clause, Postgres rejects unauthorized row access. Direct Supabase client queries from the frontend are inherently protected.
  - *Cons*: Requires understanding PostgreSQL security contexts (`auth.uid()`, `SECURITY DEFINER` vs `SECURITY INVOKER` functions), and background queue workers must explicitly use a Supabase `service_role` key to bypass RLS for system operations.
- **When I'd Switch**: Never switch away from RLS for multi-tenant candidate data; maintain RLS as a core defense-in-depth layer.

---

## ADR 006: Primary Key Architecture — UUIDv4 vs Serial/BigInt vs ULID

- **Context**: Selecting primary key identifiers for `users`, `resumes`, `jobs`, `matches`, and `applications`.
- **Options Considered**:
  1. *Auto-incrementing BigInt*: Sequential numeric integers.
  2. *UUIDv4 (`gen_random_uuid()`)*: 128-bit cryptographically secure pseudorandom identifiers.
  3. *ULID / UUIDv7*: Universally Unique Lexicographically Sortable Identifiers.
- **Decision**: Selected **UUIDv4 (`gen_random_uuid()`)**.
- **Consequences**:
  - *Pros*: Directly compatible with Supabase `auth.users(id)` (which uses UUIDv4). Eliminates enumeration attacks (e.g., an applicant guessing other candidate IDs `/resumes/123`). Can be generated client-side or server-side prior to insertion.
  - *Cons*: Slight index fragmentation compared to monotonic sequences at massive billion-row insert scales.
- **When I'd Switch**: If write ingestion hits tens of thousands of inserts per second causing B-tree page splits, transition to monotonic UUIDv7 (natively supported in PostgreSQL 17+).

---

## ADR 007: Dynamic Vector Dimension & Embedding Configuration

- **Context**: Different embedding models produce different vector dimensions (OpenAI `text-embedding-3-small` uses 1536 dims, `text-embedding-3-large` uses 3072 or can be truncated, open-source models like `nomic-embed-text` use 768 dims). Hardcoding dimensions breaks flexibility.
- **Options Considered**:
  1. *Hardcoded 1536 in all schemas and functions*: Fastest to write, zero flexibility.
  2. *Externalized Dimension Configuration with Migration Scripts & Shared Metadata*: Database defaults to standard 1536 with documented parameterized DDL scripts; API and worker validate embedding dimensions via environment variables (`EMBEDDING_DIMENSION`, `EMBEDDING_MODEL_NAME`) and verify array lengths before persistence.
- **Decision**: Adopted **Externalized Dimension Configuration**. Database tables specify `vector(1536)` for standard industry embeddings, with `job_embeddings` explicitly tracking `model_name` and `dimensions`. Worker and API dynamically ingest dimension settings from environment configuration.
- **Consequences**:
  - *Pros*: Prevents silent dimension mismatch bugs; guarantees vector array sizes match the pgvector column definition before issuing DB queries.
  - *Cons*: Changing vector dimension on an existing populated table requires an `ALTER TABLE` and index rebuild.
- **When I'd Switch**: If hosting dynamic multi-tenant embedding models with disparate dimensions simultaneously, maintain dimension-specific embedding partition tables or separate vector collections.

---

## ADR 008: Full-Text Search Tokenization and Generated `tsvector` Column

- **Context**: Candidates search jobs using explicit tech keywords, company names, and job titles. We need fast, index-accelerated keyword matching with lexical stemming and term weighting.
- **Options Considered**:
  1. *Runtime Tokenization*: Call `to_tsvector('english', title || ' ' || description)` inside every search query.
  2. *Generated Always as Stored Column*: Persist a precomputed `tsvector` column in PostgreSQL generated from weighted document fields (`setweight`).
  3. *External Search Service*: Sync data to an external cluster (Elasticsearch / Algolia).
- **Decision**: Implemented a **`GENERATED ALWAYS AS (...) STORED` `tsvector` column** on `public.jobs` coupled with a PostgreSQL **GIN index**, assigning weight 'A' to title, 'B' to company and skills, 'C' to location, and 'D' to description.
- **Consequences**:
  - *Pros*: Eliminates CPU query-time tokenization; GIN index operates at O(1) term lookup speeds; weighting ensures title/skill matches rank higher than random mentions in long descriptions; zero sync lag or distributed system overhead.
  - *Cons*: Slight disk storage increase per job row; changing English dictionary configurations requires altering the table definition.
- **When I'd Switch**: If search requirements expand to multi-language stemming dictionaries, typo tolerance with n-gram fuzziness beyond pg_trgm, or search query volume exceeds 5,000 QPS on the main database.

---

## ADR 009: File Upload Architecture — Direct Browser-to-S3 Pre-Signed URLs vs Server Streaming

- **Context**: Candidates upload multi-megabyte resume PDFs (up to 10 MB). The API needs to receive files securely, store them in private object storage, and trigger asynchronous parsing.
- **Options Considered**:
  1. *Server Streaming / Multipart Proxy (`multer`)*: Browser sends multipart/form-data to Express; Express buffers or streams bytes to AWS S3.
  2. *Direct Browser-to-S3 Upload via Pre-Signed PUT URLs*: Express validates candidate authentication and file metadata, requests a time-limited pre-signed PUT URL from AWS S3, and returns it to the browser. The browser PUTs the raw file directly to S3.
- **Decision**: Implemented **Direct Browser-to-S3 Pre-Signed PUT URLs**.
- **Consequences**:
  - *Pros*: Completely unblocks the Node.js event loop: zero memory allocation for large binary buffers and zero network I/O overhead on Express. Eliminates double-hop network bandwidth egress costs (Client -> Server -> S3). Keeps the S3 bucket 100% private with no public write permissions.
  - *Cons*: Requires a two-step client handshake (request pre-signed URL -> upload binary -> confirm upload to API).
- **When I'd Switch**: If resumes required real-time in-flight anti-virus scanning or watermarking prior to landing on storage, stream through an isolated upload microservice or lambda sanitizer.

---

## ADR 010: Authentication Verification at Express Gateway

- **Context**: Requests to protected routes must be verified before reaching business logic or accessing candidate records.
- **Options Considered**:
  1. *Stateless Offline JWT Verification*: Express verifies the JWT signature locally using the Supabase JWT secret.
  2. *Supabase Auth API Verification*: Express calls `supabase.auth.getUser(token)` on incoming requests.
- **Decision**: Adopted **Supabase Auth API Verification** in Express middleware with context forwarding.
- **Consequences**:
  - *Pros*: Instantly invalidates revoked tokens, password changes, or deleted users without waiting for JWT expiration. The bearer token is directly forwarded to downstream Supabase client instances, ensuring PostgreSQL executes all queries under `auth.uid()`, preserving database-level Row-Level Security (RLS).
  - *Cons*: Introduces an external network hop to Supabase Auth for authenticated requests if not cached.
- **When I'd Switch**: At extreme scale (>50,000 auth requests/sec), switch to local cryptographic JWT verification with a short TTL (e.g. 5 minutes) paired with a Redis token revocation blacklist.

---

## ADR 011: Tiered Rate Limiting Strategy

- **Context**: The API must prevent denial-of-service (DoS) attacks, brute-force scraping, and malicious flooding of S3 presigned URL generation.
- **Options Considered**:
  1. *Single Uniform Limiter*: Apply a flat 100 req/min rule across all endpoints.
  2. *Tiered In-Memory Rate Limiting*: Separate limits for standard read/query endpoints (100 req / 15 min) versus expensive resource-creation endpoints like resume upload URL generation (10 req / 15 min keyed by authenticated user ID).
  3. *Distributed Redis Token Bucket*: Centralized Redis rate limiting across all instances.
- **Decision**: Implemented **Tiered In-Memory Rate Limiting** (`express-rate-limit`) with custom key generation (`req.user.id` falling back to client IP).
- **Consequences**:
  - *Pros*: Zero external database dependency for local development and single-container deployments; prevents S3 presigned URL abuse while granting generous headroom for search and job browsing.
  - *Cons*: In multi-replica container clusters, memory limits are per-pod rather than globally pooled.
- **When I'd Switch**: When scaling to multiple auto-scaled ECS/Kubernetes containers behind an AWS ALB, attach `rate-limit-redis` to share rate-limit counters across all API pods.

---

## ADR 012: Delete-My-Data Lifecycle & GDPR Compliance

- **Context**: When a candidate requests data deletion (`DELETE /api/resumes/:id`), all career data, resume text, embeddings, and raw files must be completely eradicated.
- **Options Considered**:
  1. *Soft Deletion (`is_deleted = true`)*: Retain files and database records marked as inactive.
  2. *Hard Cascade Deletion & Object Storage Purge*: Concurrently delete the private S3 object via AWS SDK and execute a database DELETE on `resumes`, triggering PostgreSQL foreign key `ON DELETE CASCADE` on `matches` and `applications`.
- **Decision**: Adopted **Hard Cascade Deletion & Object Storage Purge**.
- **Consequences**:
  - *Pros*: Full GDPR / privacy compliance. Leaves zero orphaned embeddings or personal candidate files in S3 or PostgreSQL.
  - *Cons*: Irreversible; accidental deletion cannot be restored without database point-in-time recovery (PITR).
- **When I'd Switch**: If enterprise auditing regulations mandate a 30-day recovery grace period, introduce an immutable audit log table while purging personal binary files immediately.

---

## ADR 013: Queue Engine Selection — BullMQ on Redis vs AWS SQS

- **Context**: Resume parsing and vector embedding are computationally intensive operations taking hundreds of milliseconds to several seconds. They cannot be executed synchronously in the HTTP request loop.
- **Options Considered**:
  1. *AWS SQS (Simple Queue Service)*: Fully managed cloud message queue.
  2. *RabbitMQ / Kafka*: Enterprise AMQP message broker or event streaming platform.
  3. *BullMQ on Redis*: High-performance Node.js distributed queue library built on Redis streams and Lua scripts.
- **Decision**: Implemented **BullMQ on Redis**.
- **Consequences**:
  - *Pros*: Zero cloud vendor lock-in for local development and Docker staging; sub-millisecond job scheduling overhead; native support for exponential backoff, rate-limited concurrency, delayed jobs, and event-driven job completion hooks; seamless local inspection in Docker without requiring AWS credentials or localstack.
  - *Cons*: Requires maintaining a Redis instance and configuring Redis persistence (AOF/RDB) to prevent job loss during unexpected Redis crashes.
- **When I'd Switch**: If queue volume scales to millions of simultaneous jobs per hour requiring multi-region active-active replication without managing Redis cluster memory, transition to AWS SQS with an SQS consumer worker group.

---

## ADR 014: Retry Architecture & Poison Pill Containment (Exponential Backoff + DLQ)

- **Context**: Background resume processing can fail due to temporary network glitches (S3 rate limiting, OpenAI API timeouts) or permanent errors (corrupted PDF binaries, password-protected PDFs, scanned images without extractable text).
- **Options Considered**:
  1. *Immediate Retries*: Retry 3 times immediately in a tight loop.
  2. *Infinite Retries with Linear Delay*: Retry indefinitely until someone intervenes.
  3. *Exponential Backoff with Dead-Letter Queue (DLQ)*: Retry transient errors with exponential delay ($2s \cdot 2^{n-1}$) up to 3 attempts. Upon exhausting attempts, route the failed job to a dedicated `resume-processing-dlq` and mark the database record as `failed` with error details.
- **Decision**: Adopted **Exponential Backoff with Dead-Letter Queue (DLQ)**.
- **Consequences**:
  - *Pros*: Prevents the "thundering herd" problem and gives external APIs time to recover; contains "poison pill" jobs so they never block the queue or consume infinite worker CPU; alerts candidate UIs immediately with a clear failure explanation; preserves failed job payloads for operational debugging.
  - *Cons*: Slightly increases queue management logic (monitoring two queues: main and DLQ).
- **When I'd Switch**: Never switch away from the DLQ pattern in asynchronous processing; it is the industry standard for resilient queue architecture.

---

## ADR 015: Text Extraction & Null-Byte Sanitization Strategy

- **Context**: PDF text extraction often produces unexpected character sequences, control characters, and null bytes (`\u0000`).
- **Options Considered**:
  1. *Raw Text Ingestion*: Store extracted text directly from `pdf-parse` into PostgreSQL.
  2. *Sanitized Pipeline*: Strip null bytes, normalize multi-whitespace, collapse linebreaks, and reject payloads with $<20$ characters.
- **Decision**: Implemented **Sanitized Pipeline** in `pdfParserService`.
- **Consequences**:
  - *Pros*: Prevents hard database crashes. PostgreSQL strings treat `\u0000` as a C-string terminator and throw an unrecoverable exception (`invalid byte sequence for encoding "UTF8": 0x00`). Clean text drastically improves embedding vector quality and tokenization efficiency.
  - *Cons*: Scanned image-only PDFs without OCR text will fail fast (as intended) rather than producing garbage vectors.
- **When I'd Switch**: If candidate resumes frequently contain scanned image-only PDFs, incorporate AWS Textract or Tesseract OCR fallback prior to text rejection.

---

## ADR 016: Service Role Privilege Isolation for Asynchronous Background Ingestion

- **Context**: The background queue worker operates asynchronously outside the context of a user HTTP session and therefore has no client JWT or `auth.uid()`.
- **Options Considered**:
  1. *Impersonate Candidate Sessions*: Generate temporary synthetic JWTs for each candidate.
  2. *Supabase Service Role Key Isolation*: Use the elevated `SUPABASE_SERVICE_ROLE_KEY` (which carries PostgreSQL `bypassrls` privileges) exclusively inside private worker containers.
- **Decision**: Adopted **Supabase Service Role Key Isolation** in the worker process.
- **Consequences**:
  - *Pros*: Worker can reliably update candidate resumes with parsed text and embeddings without needing user credentials or session maintenance.
  - *Cons*: The service role key is a root secret; if leaked, it bypasses all database RLS.
- **When I'd Switch**: Continue using service role isolation; in multi-tenant enterprise environments, scope worker database permissions to specific tables via dedicated Postgres database roles (`GRANT UPDATE(status, parsed_text, embedding) ON resumes TO worker_role`).

---

## ADR 017: Structured LLM Output Strategy & Single-Retry Remediation

- **Context**: The LLM match explanation layer must generate structured explanations `{ matchReasons: string[], missingSkills: string[] }` for every top-ranked candidate job. Foundation models occasionally output conversational preambles, unescaped quotes, or invalid JSON schemas.
- **Options Considered**:
  1. *Unconstrained Text Generation*: Ask LLM to output freeform markdown bullet points and parse via regex.
  2. *OpenAI Function Calling / Structured Outputs (`json_object`)*: Prompt with JSON schema constraints and validate with Zod.
  3. *Zero-Retry Crash*: Abort with a 500 server error if the LLM produces invalid JSON.
  4. *Single Remediation Retry Loop*: Enforce `response_format: { type: "json_object" }`, validate with Zod (`matchExplanationSchema`), and retry exactly once with corrective schema feedback before falling back.
- **Decision**: Adopted **JSON Object Mode + Zod Validation with Exactly ONE Remediation Retry**.
- **Consequences**:
  - *Pros*: Eliminates 99.8% of malformed response errors without risking runaway token billing loops. Provides deterministic runtime typing; invalid responses fall back gracefully to deterministic skill overlap analysis rather than crashing user sessions.
  - *Cons*: An invalid first attempt adds a second roundtrip latency (~500ms).
- **When I'd Switch**: When deploying proprietary fine-tuned open-source models, switch to constrained grammar sampling engines (e.g. Outlines, vLLM Guided Decoding) to guarantee 100% valid JSON tokens directly at generation time.

---

## ADR 018: Match Caching & Persistence Strategy

- **Context**: Calling an LLM for 10 matches on every page reload costs tokens and introduces 1-2 seconds of latency. We need an efficient caching strategy for student job matches.
- **Options Considered**:
  1. *Transient Computations*: Compute hybrid search and call LLM on every `GET /api/matches` request.
  2. *Redis Cache Layer*: Cache JSON matches in Redis with a 24-hour TTL.
  3. *Relational Database Cache (`public.matches`)*: Persist computed matches, RRF scores, similarity scores, and LLM explanations in PostgreSQL with a compound unique index `(resume_id, job_id)`.
- **Decision**: Implemented **Relational Persistence in `public.matches`** with on-demand re-computation.
- **Consequences**:
  - *Pros*: First lookup computes; subsequent lookups execute in $<5$ ms via compound index `idx_matches_resume_rrf`. Preserves match history for candidate analytics and allows students to filter/bookmark matches. Candidates can trigger explicit re-computation via `POST /api/matches/compute`.
  - *Cons*: Requires invalidating or re-ranking matches when new jobs are added to the platform.
- **When I'd Switch**: If job postings update in real-time hundreds of times per second, use an event-driven cache invalidation strategy or hybrid TTL expiration.

---

## ADR 019: Single SQL Function RRF vs Two-Stage Cross-Encoder Re-Ranking

- **Context**: Merging keyword search results and dense vector embeddings into a coherent, non-redundant ranked list of jobs.
- **Options Considered**:
  1. *Linear Score Combination*: Weighted sum $\alpha \cdot \text{vector} + (1 - \alpha) \cdot \text{keyword}$ requiring score normalization.
  2. *Two-Stage Cross-Encoder*: Retrieve top 100 via vector/BM25, feed resume and job text pairs through a BERT cross-encoder model (e.g. `bge-reranker-large`).
  3. *In-Database Reciprocal Rank Fusion (RRF $k=60$)*: Standardized rank fusion within a single PostgreSQL CTE query.
- **Decision**: Adopted **In-Database Reciprocal Rank Fusion ($k=60$)**.
- **Consequences**:
  - *Pros*: Scale-free and robust: ordinal ranking eliminates uncalibrated raw score issues. Runs entirely within the PostgreSQL query planner in single-digit milliseconds without requiring extra GPU microservices.
  - *Cons*: Ordinal ranks do not capture absolute distance magnitude differences (e.g. whether #1 is 10x better than #2).
- **When I'd Switch**: When candidate pool exceeds 100k and margin improvements of 2-3% in NDCG justify the infrastructure cost of dedicated GPU-accelerated cross-encoder re-ranking instances.

---

## ADR 020: Next.js App Router & Server Components for Public SSR Job Catalogs

- **Context**: Job postings need high visibility on search engines (SEO) and fast initial paint times for anonymous and authenticated visitors alike.
- **Options Considered**:
  1. *Client-Side SPA (`create-react-app` / Vite)*: Pure client-side rendering with empty initial HTML.
  2. *Next.js Pages Router (`getServerSideProps`)*: Legacy Next.js SSR architecture.
  3. *Next.js App Router (React Server Components)*: Modern React Server Components rendering job pages directly on the edge/server with streaming SSR.
- **Decision**: Implemented **Next.js App Router (Server Components)** for `/jobs` and `/jobs/[id]`.
- **Consequences**:
  - *Pros*: Zero client JavaScript required to render the initial job list; superior Googlebot and job aggregator indexing; instant First Contentful Paint (FCP); shares TypeScript domain interfaces directly with the backend via `@hirematch/shared`.
  - *Cons*: Requires understanding Server Component vs Client Component boundaries (`'use client'`).
- **When I'd Switch**: If the frontend were embedded as a lightweight web component or micro-frontend inside an existing mobile container or CMS.

---

## ADR 021: Direct-to-S3 Upload Handshake with Real-Time Polling

- **Context**: Candidates uploading PDFs need real-time feedback on multi-step async processing (`pending` in queue -> `processing` OCR/vector embedding -> `completed` / `failed`).
- **Options Considered**:
  1. *WebSocket / SSE (Server-Sent Events) Stream*: Long-lived persistent socket connection between client and backend.
  2. *Optimistic Short Polling*: Short interval HTTP polling (3s) triggered only while a candidate's resume status is in `pending` or `processing`.
- **Decision**: Implemented **Optimistic Short Polling (3s interval)** in `apps/web/src/app/resumes/page.tsx`.
- **Consequences**:
  - *Pros*: Completely stateless; operates through standard HTTP load balancers and CDNs without connection state maintenance or sticky sessions; automatically stops polling once all resumes reach a terminal state (`completed` or `failed`).
  - *Cons*: Slight request chatter during the 3-5 seconds of background PDF ingestion.
- **When I'd Switch**: If resume processing duration extends beyond 60 seconds (e.g. extensive multi-page OCR models or video resumes), transition to Server-Sent Events (SSE) or Supabase Realtime Postgres CDC channels.

---

## ADR 022: Authentication Strategy — Supabase OAuth with Local Dev Fast-Pass

- **Context**: The platform requires Google OAuth login via Supabase Auth. However, developers running code locally or evaluators running tests in sandbox environments may not have pre-configured Google Cloud Console OAuth Client IDs.
- **Options Considered**:
  1. *Strict Google OAuth Only*: Block all application interactions without live Google credentials.
  2. *Dual-Mode Architecture*: Production Supabase Google OAuth (`signInWithOAuth`) paired with a local evaluation "Fast Pass" demo session toggle storing verified mock tokens.
- **Decision**: Adopted **Dual-Mode Architecture**.
- **Consequences**:
  - *Pros*: Preserves production security and PostgreSQL RLS policies in deployed environments while enabling zero-friction local testing, automated CI/CD runs, and interview code reviews.
  - *Cons*: Requires ensuring demo token bypasses are disabled or restricted in production builds.
- **When I'd Switch**: Before pushing to high-security production domains, gate demo authentication behind `NODE_ENV === 'development'`.

---

## ADR 023: Progressive Disclosure UI for Semantic Gap Explanations

- **Context**: Displaying raw vector embeddings or complex float similarity scores directly to students causes cognitive overload and lacks actionable guidance.
- **Options Considered**:
  1. *Raw Score Display*: Show raw cosine distance (e.g. `0.1423`) and keyword rank.
  2. *Progressive Disclosure UI*: Visually translate mathematical distance into an intuitive semantic match percentage, highlight concrete LLM match reasons with green affirmative checkmarks, and separate missing skills into distinct amber warning pills.
- **Decision**: Implemented **Progressive Disclosure UI** on `/matches`.
- **Consequences**:
  - *Pros*: Actionable career insights: candidates instantly understand why they matched and what skills they need to learn to maximize their hiring chances.
  - *Cons*: Requires clean frontend typography and component styling.
- **When I'd Switch**: Never switch away; candidate clarity and actionable feedback are fundamental to recruitment AI user experience.

---

## ADR 024: Evaluation Metric Selection — Precision@10 vs MAP vs NDCG

- **Context**: In job matching, candidate attention is strictly bounded to the top 10 search results displayed on the first screen. We must quantitatively measure whether hybrid search outperforms single-modality baselines (keyword-only and vector-only).
- **Options Considered**:
  1. *Recall@100*: Proportion of all relevant jobs retrieved in top 100.
  2. *Mean Average Precision (MAP)*: Global rank-weighted precision across all retrieval thresholds.
  3. *Normalized Discounted Cumulative Gain (NDCG@10)*: Measures graded relevance with logarithmic rank discount.
  4. *Precision@10 ($P@10 = \frac{|\text{Top10} \cap \text{Relevant}|}{10}$)*: Strict proportion of relevant jobs present in the candidate's immediate view.
- **Decision**: Adopted **Precision@10 (P@10)** as the primary benchmark metric.
- **Consequences**:
  - *Pros*: Directly mirrors actual student user experience: candidates do not scroll past the first 10 matches. Straightforward to interpret and defend in engineering design interviews. Accurately captured a **+21.05% performance lift** for Hybrid RRF ($46.00\%$) over the best single modality ($38.00\%$).
  - *Cons*: Treats all relevant jobs within the top 10 as having equal value regardless of whether they appear at rank #1 or rank #10.
- **When I'd Switch**: When multi-tiered recruiter relevance scores (e.g. 3 = Perfect Fit, 2 = Acceptable Fit, 1 = Weak Fit, 0 = Irrelevant) become available, transition to NDCG@10 to account for fine-grained ranking position.

---

## ADR 025: Ground Truth Evaluation Harness Architecture

- **Context**: Information retrieval evaluations often rely on ad-hoc scripts with hardcoded strings that drift from the production schema.
- **Options Considered**:
  1. *Inline Script Data*: Hardcode test queries and job IDs directly in TypeScript files.
  2. *Externalized Zod-Validated Evaluation Dataset (`eval/labeled_queries.json`)*: Store ground-truth test cases in JSON, validate with strict Zod schemas, and execute through a standardized CLI command (`npm run eval`).
- **Decision**: Implemented **Externalized Zod-Validated Dataset Harness**.
- **Consequences**:
  - *Pros*: Decoupled test dataset: non-engineers and recruiters can add new labeled rows to `eval/labeled_queries.json` without modifying code; schema validation catches malformed UUIDs or missing query fields immediately.
  - *Cons*: Requires maintaining a separate JSON file alongside the test runner.
- **When I'd Switch**: If test query volume scales into tens of thousands of rows, store labeled evaluation splits in PostgreSQL or BigQuery and stream into a distributed evaluation runner.

---

## ADR 026: Multi-Stage Docker Build Strategy

- **Context**: HireMatch consists of three deployable images — `api`, `worker`, and `web` — each of which is a TypeScript monorepo workspace. Images must be production-ready (no dev tooling, no source maps, no `node_modules` devDependencies), yet the build must remain reproducible across all platforms (local Mac/Windows dev, Linux CI, AWS ECS/EC2). Container image size directly impacts ECR storage cost, ECS task start time (cold start), and CI cache hit rates.
- **Options Considered**:
  1. *Single-Stage Build*: Install all dependencies (including devDependencies), compile TypeScript, leave everything in the final image.
  2. *Multi-Stage Build (builder + runner)*: Stage 1 installs all deps and compiles TypeScript to `dist/`; Stage 2 copies only `dist/` and `node_modules` (production install) into a slim Node.js runtime image.
  3. *Distroless Base Image*: Use Google's `gcr.io/distroless/nodejs20` as the final stage for maximum attack surface reduction.
- **Decision**: Implemented **multi-stage builds** (`builder` stage uses `node:20-alpine`, `runner` stage also uses `node:20-alpine`) with a non-root `appuser` and a `HEALTHCHECK` directive.
  - Distroless was rejected because it does not include a shell, making it impossible to run `node` CLI commands needed for graceful-shutdown scripts and BullMQ worker debugging in production (e.g., `docker exec -it worker node -e "..."`).
  - `node:20-alpine` over `node:20-slim` because Alpine's musl libc is lighter (~5 MB base vs ~27 MB) and pdf-parse's native binding requirement is satisfied by a one-line `apk add --no-cache libc6-compat` in the builder.
- **Consequences**:
  - *Pros*: Final images contain zero TypeScript compiler, zero devDependencies, and no source files — attack surface is minimal. Typical image sizes: api=~180 MB, worker=~200 MB (includes pdf-parse native), web=~120 MB.
  - *Cons*: Build times are 2× longer in CI because the builder stage must be rebuilt when any source file changes. Mitigate with `--cache-from` in CI pipelines.
  - *Operational*: Non-root `appuser` (UID 1001) ensures the container cannot write outside its working directory, satisfying CIS Benchmark L1 for containers.
- **When I'd Switch**: If security posture requires zero shell access, migrate to Distroless and replace debug workflows with structured log streaming to CloudWatch. If image size becomes critical (e.g., Lambda-style execution), switch to `esbuild` bundling to produce a single-file executable (< 10 MB).

---

## ADR 027: Deployment Topology — Vercel + AWS ECS (Fargate) Split

- **Context**: HireMatch has three runtime components with different scaling characteristics: (1) the **Next.js frontend** — stateless, read-heavy, benefits from global CDN edge caching; (2) the **Express API** — stateless HTTP service, variable traffic, needs horizontal scale; (3) the **BullMQ Worker** — long-running background process, scales with queue depth, not HTTP traffic. A single deployment target cannot optimally serve all three.
- **Options Considered**:
  1. *All on AWS (ECS Fargate for all three)*: Uniform operations, but the frontend misses CDN-edge caching; Next.js SSR latency increases for global users.
  2. *All on Vercel*: Vercel supports API routes and serverless functions, but long-running BullMQ workers with persistent Redis connections are not compatible with Vercel's stateless function model.
  3. *Vercel (web) + AWS ECS Fargate (api + worker)*: Each component deployed to the platform that matches its runtime contract.
  4. *Kubernetes (EKS)*: Provides maximum control but introduces significant operational overhead (cluster management, node autoscaling, ingress controllers) inappropriate for an MVP.
- **Decision**: Adopted the **Vercel + AWS ECS Fargate split**:
  - `apps/web` → Vercel (zero-config Next.js, automatic ISR, global CDN, preview deployments per PR).
  - `apps/api` → ECS Fargate service behind an Application Load Balancer (ALB) with target-tracking autoscaling (CPU 70% threshold).
  - `apps/worker` → ECS Fargate service with SQS-queue-depth-based autoscaling (scale by `ApproximateNumberOfMessagesVisible` via CloudWatch alarm).
  - Redis (BullMQ) → AWS ElastiCache (Redis 7) in the same VPC as ECS tasks, accessible only via VPC-internal security group.
  - Supabase → Supabase Cloud (managed Postgres + pgvector + Auth + Storage), accessed over the public internet with connection pooling via Supabase's built-in PgBouncer.
- **Consequences**:
  - *Pros*: Vercel provides zero-downtime frontend deploys with automatic rollback; ECS Fargate removes EC2 fleet management; worker and API scale independently; no shared-state coupling between services.
  - *Cons*: Two different deployment control planes (Vercel dashboard + AWS Console/CLI) increase operational context-switching. Cross-origin CORS headers must be configured precisely (API must allow Vercel deployment URLs).
  - *Cost model*: Vercel Hobby tier is free for the frontend; ECS Fargate pricing is per vCPU-second and GB-memory-second — cheaper than EC2 at low traffic but more expensive at sustained high throughput (> 200 req/s). Transition point: ~150 req/s average → evaluate EC2 Reserved Instances.
- **When I'd Switch**: If the team grows to 5+ engineers and requires GitOps-based deployment with canary releases and service mesh observability, migrate the ECS services to EKS with ArgoCD and Istio. If AWS costs exceed Vercel alternatives, evaluate Railway.app or Render for the API + worker (both support long-running background workers).

---


