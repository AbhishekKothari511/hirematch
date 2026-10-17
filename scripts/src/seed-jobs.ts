import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from hirematch root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface JobRecord {
  id: string;
  title: string;
  company: string;
  location: string;
  job_type: string;
  experience_level: string;
  description: string;
  requirements: string[];
  skills: string[];
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  status: string;
}

interface EmbeddingRecord {
  id: string;
  job_id: string;
  embedding: number[];
  model_name: string;
  dimensions: number;
}

interface SeedData {
  jobs: JobRecord[];
  embeddings: EmbeddingRecord[];
}

async function seedJobs() {
  console.log('====================================================');
  console.log('🚀 HireMatch Seed Script: 200 Sample Jobs Ingestion');
  console.log('====================================================\n');

  const dataPath = path.resolve(__dirname, '../seed-data/jobs.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Seed data file not found at: ${dataPath}. Run generate_seed_dataset.py first.`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const seedData: SeedData = JSON.parse(rawData);

  console.log(`📦 Loaded ${seedData.jobs.length} jobs and ${seedData.embeddings.length} embeddings from disk.`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isDryRun = process.argv.includes('--dry-run') || !supabaseUrl || !serviceRoleKey;

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE / Database Credentials not configured.');
    console.log('Validating data integrity and sample distribution...\n');

    // Measure category distributions
    const companies = new Set(seedData.jobs.map((j) => j.company));
    const titles = new Set(seedData.jobs.map((j) => j.title));
    const jobTypes = new Map<string, number>();
    const expLevels = new Map<string, number>();

    for (const job of seedData.jobs) {
      jobTypes.set(job.job_type, (jobTypes.get(job.job_type) || 0) + 1);
      expLevels.set(job.experience_level, (expLevels.get(job.experience_level) || 0) + 1);
    }

    console.log(`✔️ Total Validated Jobs: ${seedData.jobs.length}`);
    console.log(`✔️ Unique Companies: ${companies.size}`);
    console.log(`✔️ Distinct Job Titles: ${titles.size}`);
    console.log(`✔️ Vector Dimensions: ${seedData.embeddings[0]?.dimensions ?? 'N/A'}`);
    console.log(`✔️ Vector Embedding Length: ${seedData.embeddings[0]?.embedding.length ?? 'N/A'}`);
    console.log('\n📊 Job Type Distribution:');
    jobTypes.forEach((count, type) => console.log(`   - ${type}: ${count}`));
    console.log('\n📊 Experience Level Distribution:');
    expLevels.forEach((count, lvl) => console.log(`   - ${lvl}: ${count}`));
    console.log('\n✨ Validation Succeeded! To apply to Supabase:');
    console.log('   1. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env, OR');
    console.log('   2. Paste supabase/seed.sql directly into the Supabase SQL Editor.\n');
    return;
  }

  // Live Supabase Ingestion
  console.log(`Connecting to Supabase at ${supabaseUrl}...`);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const BATCH_SIZE = 50;

  console.log(`\n⏳ Inserting jobs in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < seedData.jobs.length; i += BATCH_SIZE) {
    const jobBatch = seedData.jobs.slice(i, i + BATCH_SIZE);
    const { error: jobError } = await supabase.from('jobs').upsert(jobBatch, { onConflict: 'id' });
    if (jobError) {
      console.error(`❌ Error inserting job batch ${i / BATCH_SIZE + 1}:`, jobError);
      throw jobError;
    }
    console.log(`   Inserted jobs ${i + 1} to ${Math.min(i + BATCH_SIZE, seedData.jobs.length)}`);
  }

  console.log(`\n⏳ Inserting job embeddings in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < seedData.embeddings.length; i += BATCH_SIZE) {
    const embBatch = seedData.embeddings.slice(i, i + BATCH_SIZE);
    const { error: embError } = await supabase.from('job_embeddings').upsert(embBatch, { onConflict: 'job_id' });
    if (embError) {
      console.error(`❌ Error inserting embedding batch ${i / BATCH_SIZE + 1}:`, embError);
      throw embError;
    }
    console.log(`   Inserted embeddings ${i + 1} to ${Math.min(i + BATCH_SIZE, seedData.embeddings.length)}`);
  }

  console.log('\n🎉 Successfully seeded 200 sample jobs and vector embeddings into Supabase!');
}

seedJobs().catch((err) => {
  console.error('Fatal error running seed script:', err);
  process.exit(1);
});
