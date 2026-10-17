import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Creates a Supabase client authenticated under the requesting user's JWT.
 * 
 * Non-obvious / Interview Talking Point:
 * When making requests to Supabase with the user's bearer token, PostgreSQL executes
 * all queries under that user's identity (setting auth.uid() in Postgres session context).
 * This ensures that Row-Level Security (RLS) is evaluated directly at the database engine,
 * preventing accidental cross-tenant data leaks even if an API route query omits a WHERE clause.
 */
export function getSupabaseClient(accessToken?: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

/**
 * Returns a Supabase client authenticated with the service_role secret.
 * 
 * Non-obvious / Interview Talking Point:
 * The service_role key possesses Postgres `bypassrls` privileges. It should ONLY be
 * used for background processing (BullMQ worker parsing resumes), system health checks,
 * or administrative maintenance. It should NEVER be leaked to frontend clients.
 */
export function getServiceRoleClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
