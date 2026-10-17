import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from root monorepo or current directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Supabase
  SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('dummy-anon-key-for-dev'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('dummy-service-role-key-for-dev'),

  // AWS S3
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default('mock-aws-access-key'),
  AWS_SECRET_ACCESS_KEY: z.string().default('mock-aws-secret-key'),
  S3_BUCKET_NAME: z.string().default('hirematch-resumes-private'),
  S3_SIGNED_URL_EXPIRATION_SECONDS: z.coerce.number().default(900),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().default(10), // 10 uploads per 15 min
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
