import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Redis / BullMQ
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().default(5),

  // Supabase (Uses service role key to bypass RLS for background ingestion)
  SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('dummy-service-role-key-for-worker'),

  // AWS S3
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default('mock-aws-access-key'),
  AWS_SECRET_ACCESS_KEY: z.string().default('mock-aws-secret-key'),
  S3_BUCKET_NAME: z.string().default('hirematch-resumes-private'),

  // Vector Search & Embeddings (Model and dimensions from env, not hardcoded)
  EMBEDDING_PROVIDER: z.string().default('openai'),
  EMBEDDING_MODEL_NAME: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1536),
  OPENAI_API_KEY: z.string().optional(),
});

const parsed = workerEnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid Worker environment configuration:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
