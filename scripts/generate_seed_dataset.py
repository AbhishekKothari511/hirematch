"""
HireMatch - 200 Realistic Tech Jobs Dataset Generator
Generates:
1. scripts/seed-data/jobs.json
2. supabase/seed.sql (raw SQL insert for direct execution in Supabase SQL editor)
3. Clustered 1536-dimensional unit vectors for realistic semantic search evaluation
"""

import json
import math
import os
import random
import uuid

# Set deterministic random seed for exact reproducibility
random.seed(42)

COMPANIES = [
    ("Joveo", "Bengaluru, India", "AI Recruitment & AdTech"),
    ("Stripe", "San Francisco, CA", "FinTech & Payments Infrastructure"),
    ("Datadog", "New York, NY", "Cloud Monitoring & Observability"),
    ("Vercel", "Remote, Global", "Frontend Cloud & Developer Experience"),
    ("Supabase", "Remote, Global", "Open Source Backend-as-a-Service"),
    ("Snowflake", "San Mateo, CA", "Data Cloud & Analytics"),
    ("DoorDash", "San Francisco, CA", "Logistics & On-Demand Delivery"),
    ("Airbnb", "San Francisco, CA", "Hospitality & Marketplace"),
    ("Shopify", "Ottawa, Canada", "Global Commerce Infrastructure"),
    ("Cloudflare", "Austin, TX", "Edge Computing & Web Security"),
    ("Figma", "San Francisco, CA", "Collaborative Design Systems"),
    ("Linear", "Remote, Global", "Developer Productivity & Issue Tracking"),
    ("Notion", "San Francisco, CA", "Connected Workspace & AI"),
    ("Ramp", "New York, NY", "Corporate Cards & Spend Management"),
    ("Postman", "Bengaluru, India", "API Lifecycle Platform"),
    ("Razorpay", "Bengaluru, India", "Payment Gateway & Banking Solutions"),
    ("Cred", "Bengaluru, India", "Credit Card Rewards & FinTech"),
    ("Pinecone", "New York, NY", "Managed Vector Database"),
    ("Scale AI", "San Francisco, CA", "Data Infrastructure for Generative AI"),
    ("Perplexity AI", "San Francisco, CA", "Conversational AI Search"),
    ("Anthropic", "San Francisco, CA", "AI Safety & Foundation Models"),
    ("GitLab", "Remote, Global", "DevSecOps Platform"),
    ("Elastic", "Mountain View, CA", "Search & Observability"),
    ("Confluent", "Palo Alto, CA", "Real-Time Event Streaming (Kafka)"),
    ("Retool", "San Francisco, CA", "Internal Tool Development"),
]

JOB_CATEGORIES = [
    {
        "category": "Full Stack Engineering",
        "titles": [
            "Software Engineering Intern (Full Stack)",
            "Full Stack Software Engineer",
            "Senior Full Stack Developer",
            "Founding Full Stack Engineer",
            "Staff Full Stack Architect",
        ],
        "skills": ["TypeScript", "React", "Next.js", "Node.js", "Express.js", "PostgreSQL", "Supabase", "Tailwind CSS", "REST APIs", "Git"],
        "min_salary": 95000,
        "max_salary": 175000,
    },
    {
        "category": "AI / Machine Learning",
        "titles": [
            "AI Engineering Intern",
            "Machine Learning Engineer",
            "Applied LLM Engineer",
            "Senior GenAI Infrastructure Engineer",
            "AI Research Engineer",
        ],
        "skills": ["Python", "PyTorch", "LLMs", "LangChain", "Vector Databases", "pgvector", "Embeddings", "Hugging Face", "RAG", "FastAPI"],
        "min_salary": 115000,
        "max_salary": 210000,
    },
    {
        "category": "Backend Engineering",
        "titles": [
            "Backend Engineering Intern",
            "Backend Systems Engineer",
            "Senior Backend Engineer",
            "Distributed Systems Engineer",
            "Staff Platform Engineer",
        ],
        "skills": ["Go", "Node.js", "PostgreSQL", "Redis", "gRPC", "Docker", "Microservices", "Kafka", "SQL Optimization", "System Design"],
        "min_salary": 100000,
        "max_salary": 185000,
    },
    {
        "category": "Frontend Engineering",
        "titles": [
            "Frontend Engineering Intern",
            "Frontend Engineer",
            "Senior UI Engineer",
            "Web Performance Engineer",
            "Staff Design Systems Engineer",
        ],
        "skills": ["React", "Next.js", "TypeScript", "Tailwind CSS", "Redux", "Web Performance", "Accessibility (a11y)", "CSS Modules", "Vite", "GraphQL"],
        "min_salary": 90000,
        "max_salary": 165000,
    },
    {
        "category": "DevOps & Cloud Infrastructure",
        "titles": [
            "Cloud Infrastructure Intern",
            "DevOps Engineer",
            "Senior Site Reliability Engineer",
            "Cloud Architect (AWS)",
            "Staff Infrastructure Security Engineer",
        ],
        "skills": ["AWS", "Kubernetes", "Docker", "Terraform", "CI/CD", "Linux", "Prometheus", "Grafana", "Helm", "Ansible"],
        "min_salary": 105000,
        "max_salary": 190000,
    },
    {
        "category": "Data Engineering",
        "titles": [
            "Data Engineering Intern",
            "Data Engineer",
            "Senior Analytics Engineer",
            "Big Data Infrastructure Engineer",
            "Lead Data Architect",
        ],
        "skills": ["Python", "SQL", "Apache Spark", "Snowflake", "dbt", "Airflow", "PostgreSQL", "Kafka", "Data Modeling", "ETL Pipelines"],
        "min_salary": 98000,
        "max_salary": 180000,
    },
    {
        "category": "Mobile Engineering",
        "titles": [
            "Mobile App Development Intern",
            "React Native Engineer",
            "iOS Software Engineer",
            "Android Software Engineer",
            "Staff Mobile Architect",
        ],
        "skills": ["React Native", "TypeScript", "Swift", "Kotlin", "Mobile UI", "REST APIs", "GraphQL", "App Store Deployment", "Redux", "Firebase"],
        "min_salary": 92000,
        "max_salary": 170000,
    },
    {
        "category": "Security Engineering",
        "titles": [
            "Application Security Intern",
            "Security Engineer",
            "Senior Penetration Tester",
            "Cloud Security Engineer",
            "Lead AppSec Architect",
        ],
        "skills": ["Application Security", "Penetration Testing", "OAuth2", "SOC2", "Cryptography", "OWASP Top 10", "Python", "AWS IAM", "Network Security", "Vulnerability Management"],
        "min_salary": 110000,
        "max_salary": 195000,
    },
]

EXPERIENCE_LEVELS = ["entry", "entry", "mid", "mid", "senior"]
JOB_TYPES = ["full-time", "full-time", "internship", "remote", "contract"]

DIMENSIONS = 1536

def generate_cluster_center(dim):
    """Generate a random unit vector for a cluster centroid."""
    vec = [random.gauss(0, 1) for _ in range(dim)]
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec]

# Pre-generate 8 cluster centroids for the 8 job categories
CATEGORY_CENTROIDS = [generate_cluster_center(DIMENSIONS) for _ in range(len(JOB_CATEGORIES))]

def sample_clustered_vector(centroid, noise_scale=0.15):
    """Sample a vector near the cluster centroid with specified noise, normalized to unit length."""
    noisy = [c + random.gauss(0, noise_scale) for c in centroid]
    norm = math.sqrt(sum(x * x for x in noisy))
    return [round(x / norm, 6) for x in noisy]

jobs_list = []
embeddings_list = []

total_jobs = 200
for i in range(total_jobs):
    cat_idx = i % len(JOB_CATEGORIES)
    category_info = JOB_CATEGORIES[cat_idx]
    comp_info = COMPANIES[random.randint(0, len(COMPANIES) - 1)]
    
    title = random.choice(category_info["titles"])
    is_intern = "Intern" in title
    exp_level = "entry" if is_intern else random.choice(EXPERIENCE_LEVELS)
    job_type = "internship" if is_intern else random.choice(JOB_TYPES)
    
    company_name, comp_location, comp_industry = comp_info
    location = "Remote" if job_type == "remote" else (comp_location if random.random() > 0.3 else "Bengaluru, India")
    
    # Select 4-6 primary skills from category + 1-2 cross-functional
    primary_skills = random.sample(category_info["skills"], min(len(category_info["skills"]), random.randint(4, 7)))
    if random.random() > 0.4:
        primary_skills.append("Git")
    if random.random() > 0.5:
        primary_skills.append("Docker")
    skills = list(dict.fromkeys(primary_skills))
    
    # Salary calculation
    if is_intern:
        sal_min = random.randint(35000, 50000)
        sal_max = sal_min + random.randint(10000, 25000)
    else:
        sal_min = category_info["min_salary"] + random.randint(-10000, 15000)
        sal_max = sal_min + random.randint(25000, 45000)
        if exp_level == "senior":
            sal_min += 40000
            sal_max += 60000
            
    # Requirements
    requirements = [
        f"Hands-on expertise with {skills[0]} and {skills[1]}.",
        f"Demonstrated experience designing and shipping scalable software in a fast-paced environment.",
        f"Comfort with relational databases, schema design, and query optimization ({'PostgreSQL' if 'PostgreSQL' in skills else 'modern databases'}).",
        f"Strong analytical mindset and deep curiosity to dive into complex system trade-offs.",
        f"Degree in Computer Science, related technical field, or equivalent practical project experience."
    ]
    if is_intern:
        requirements[1] = "Track record of building real projects that people use (open-source commits, web apps, hackathons)."

    # Rich description
    description = (
        f"Join the engineering team at {company_name} ({comp_industry}) as a {title}. "
        f"We are building next-generation products that touch millions of users worldwide. "
        f"In this role, you will be responsible for end-to-end feature delivery: from whiteboard system architecture "
        f"to production deployment. You will collaborate closely with engineering leadership to solve high-impact technical "
        f"challenges including indexing, retrieval latency, caching, and resilient APIs. "
        f"Our stack heavily leverages {', '.join(skills[:5])}. "
        f"We value engineers who think like founders, move fast with high quality, and own every commit."
    )

    job_id = str(uuid.uuid4())
    job_record = {
        "id": job_id,
        "title": title,
        "company": company_name,
        "location": location,
        "job_type": job_type,
        "experience_level": exp_level,
        "description": description,
        "requirements": requirements,
        "skills": skills,
        "salary_min": sal_min,
        "salary_max": sal_max,
        "salary_currency": "USD",
        "status": "active"
    }
    
    # Generate clustered vector
    vector = sample_clustered_vector(CATEGORY_CENTROIDS[cat_idx], noise_scale=0.12)
    embedding_record = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "embedding": vector,
        "model_name": "text-embedding-3-small",
        "dimensions": DIMENSIONS
    }
    
    jobs_list.append(job_record)
    embeddings_list.append(embedding_record)

# Ensure target directories exist
os.makedirs("scripts/seed-data", exist_ok=True)
os.makedirs("supabase/seed", exist_ok=True)

# 1. Write JSON dataset
with open("scripts/seed-data/jobs.json", "w", encoding="utf-8") as f:
    json.dump({"jobs": jobs_list, "embeddings": embeddings_list}, f, indent=2)

print(f"Generated {len(jobs_list)} jobs in scripts/seed-data/jobs.json")

# 2. Write Supabase SQL Seed
with open("supabase/seed.sql", "w", encoding="utf-8") as f:
    f.write("-- ============================================================================\n")
    f.write("-- HireMatch Seed Data: 200 Production-Quality Sample Jobs with Vector Embeddings\n")
    f.write("-- ============================================================================\n\n")
    f.write("BEGIN;\n\n")
    
    for job, emb in zip(jobs_list, embeddings_list):
        def esc(s):
            return s.replace("'", "''")

        title_esc = esc(job["title"])
        company_esc = esc(job["company"])
        location_esc = esc(job["location"])
        desc_esc = esc(job["description"])

        req_items = ", ".join(f"'{esc(r)}'" for r in job["requirements"])
        reqs_esc = f"ARRAY[{req_items}]::TEXT[]"
        
        skill_items = ", ".join(f"'{esc(s)}'" for s in job["skills"])
        skills_esc = f"ARRAY[{skill_items}]::TEXT[]"
        
        f.write(f"INSERT INTO public.jobs (id, title, company, location, job_type, experience_level, description, requirements, skills, salary_min, salary_max, salary_currency, status)\n")
        f.write(f"VALUES ('{job['id']}', '{title_esc}', '{company_esc}', '{location_esc}', '{job['job_type']}', '{job['experience_level']}', '{desc_esc}', {reqs_esc}, {skills_esc}, {job['salary_min']}, {job['salary_max']}, '{job['salary_currency']}', '{job['status']}')\n")
        f.write(f"ON CONFLICT (id) DO NOTHING;\n\n")
        
        # Vector string representation: '[0.0123, -0.0456, ...]'
        vec_str = "[" + ", ".join(f"{x:.6f}" for x in emb["embedding"]) + "]"
        f.write(f"INSERT INTO public.job_embeddings (id, job_id, embedding, model_name, dimensions)\n")
        f.write(f"VALUES ('{emb['id']}', '{job['id']}', '{vec_str}'::vector, '{emb['model_name']}', {emb['dimensions']})\n")
        f.write(f"ON CONFLICT (job_id) DO NOTHING;\n\n")
        
    f.write("COMMIT;\n")

print(f"Generated complete SQL seed with 200 jobs in supabase/seed.sql")
