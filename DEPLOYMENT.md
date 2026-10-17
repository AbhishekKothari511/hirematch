# HireMatch - Production Deployment & Infrastructure Runbook

This guide details the production deployment architecture for **HireMatch**, an AI-powered job matching platform using Next.js on Vercel, Express API & BullMQ Worker in Docker on AWS (ECS/EC2), Supabase PostgreSQL with pgvector, and AWS S3 private storage.

---

## 1. Target Architecture & Infrastructure Topology

```
[Candidate Browser]
        │
        ├── (1) HTML / SSR Pages ──────────► [ Vercel Edge CDN ]
        │                                      (apps/web: Next.js App Router)
        │
        ├── (2) Direct PDF Upload (PUT) ────► [ AWS S3 Private Bucket ]
        │                                      (hirematch-resumes-private)
        │
        └── (3) REST API Requests ──────────► [ AWS Application Load Balancer ]
                                               │
                                               ▼
                                      [ AWS ECS Fargate Cluster ]
                                      ├── Task: apps/api (Express REST API)
                                      └── Task: apps/worker (BullMQ Worker)
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         ▼                                           ▼
             [ AWS ElastiCache / Redis ]                 [ Supabase PostgreSQL ]
             ├── resume-processing queue                 ├── Core tables (users, resumes, jobs)
             └── resume-processing-dlq                   ├── pgvector HNSW index (cosine)
                                                         ├── tsvector GIN index (keyword)
                                                         ├── Row-Level Security (RLS)
                                                         └── hybrid_search_jobs() SQL function
```

---

## 2. Frontend Deployment: Vercel (Next.js App Router)

### Step 1: Link Monorepo in Vercel Dashboard
1. Connect your GitHub repository to Vercel.
2. In **Project Settings**:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: `Next.js`
   - **Build Command**: `cd ../.. && npm install && npm run build --workspace=@hirematch/web`
   - **Output Directory**: `.next`

### Step 2: Configure Environment Variables
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://api.hirematch.yourdomain.com/api` | Target Express REST API |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` | Supabase Auth API endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1Ni...` | Public anonymous key for client session |

---

## 3. Backend Deployment: AWS ECS Fargate (API & Worker)

### Step 1: AWS ECR Image Build & Push
Create two Amazon Elastic Container Registry (ECR) repositories:
- `hirematch-api`
- `hirematch-worker`

```bash
# Authenticate Docker to AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build & Push Express API
docker build -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/hirematch-api:latest -f apps/api/Dockerfile .
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/hirematch-api:latest

# Build & Push BullMQ Worker
docker build -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/hirematch-worker:latest -f apps/worker/Dockerfile .
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/hirematch-worker:latest
```

### Step 2: ECS Task IAM Role Permissions
Attach an IAM policy to the ECS Task Role allowing S3 operations on the private bucket:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::hirematch-resumes-private/*"
    }
  ]
}
```

### Step 3: Application Load Balancer (ALB) Setup
- **Target Group**: Port 4000 (HTTP).
- **Health Check Path**: `/api/health`
- **Health Check Interval**: 30 seconds (healthy threshold: 2, unhealthy threshold: 3).
- **SSL Termination**: Attach an AWS Certificate Manager (ACM) certificate for `api.hirematch.yourdomain.com`.

---

## 4. AWS S3 Private Bucket & Direct-Upload CORS Configuration

Create a private S3 bucket: `hirematch-resumes-private`.
Ensure **Block all public access** is set to **ON**.

### S3 CORS Policy
To allow candidate browsers to upload resumes directly via pre-signed PUT URLs without CORS errors, apply this CORS configuration:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "https://hirematch.yourdomain.com",
      "https://*.vercel.app",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## 5. Supabase PostgreSQL & Migration Runbook

### Step 1: Run SQL Migrations
Execute the migrations in sequential order using the Supabase CLI or the SQL Editor:
```bash
# Via Supabase CLI
supabase db push
```
Or execute in order in the Supabase Dashboard:
1. `supabase/migrations/20260101000001_enable_extensions.sql` (enables `vector`, `pgcrypto`, `pg_trgm`)
2. `supabase/migrations/20260101000002_create_tables.sql` (creates `users`, `jobs`, `job_embeddings`, `resumes`, `matches`, `applications`)
3. `supabase/migrations/20260101000003_create_indexes.sql` (constructs HNSW index on embeddings, GIN index on tsvector)
4. `supabase/migrations/20260101000004_create_rls_policies.sql` (enforces row-level security on all tables)
5. `supabase/migrations/20260101000005_hybrid_search_function.sql` (deploys `hybrid_search_jobs` SQL function)

### Step 2: Seed 200 Production-Quality Sample Jobs
Execute the seed script to populate jobs and indexed vector embeddings:
```bash
# Option A: Execute seed script via Supabase client
npm run seed

# Option B: Execute seed.sql directly in Supabase SQL editor
# File: supabase/seed.sql
```

---

## 6. Production Health Checks & Verification Commands

```bash
# 1. API Health Check
curl -f https://api.hirematch.yourdomain.com/api/health

# 2. Public Job Catalog Ping
curl -f https://api.hirematch.yourdomain.com/api/jobs?limit=5

# 3. Information Retrieval Benchmark
npm run eval
```
