import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured with the service_role secret.
 * 
 * Non-obvious / Interview Talking Point:
 * Service Role Privilege Isolation for Asynchronous Background Ingestion:
 * - Queue worker jobs execute asynchronously without a client HTTP request or user JWT.
 * - The service_role key allows the worker to bypass RLS to update `public.resumes`
 *   with parsed text and embeddings, regardless of which candidate owns the row.
 * - This service_role key is strictly isolated inside the private backend worker container
 *   and never exposed to frontend clients.
 */
export function getWorkerSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}
