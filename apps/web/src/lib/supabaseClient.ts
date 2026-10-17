import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-web';

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return browserClient;
}

/**
 * Initiates Google OAuth login via Supabase Auth
 * 
 * Non-obvious / Interview Talking Point:
 * OAuth Flow Architecture:
 * 1. User clicks "Continue with Google".
 * 2. Supabase Auth redirects browser to Google Identity Provider.
 * 3. Upon approval, Google redirects back with authorization code.
 * 4. Supabase exchanges code for JWT and creates user session.
 * 5. Database trigger `on_auth_user_created` fires in PostgreSQL,
 *    automatically creating the candidate profile row in `public.users`.
 */
export async function signInWithGoogle(redirectTo?: string): Promise<{ error: Error | null }> {
  const supabase = getBrowserSupabase();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const callbackUrl = redirectTo || `${origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
    },
  });

  return { error };
}

export async function signOutUser(): Promise<void> {
  const supabase = getBrowserSupabase();
  await supabase.auth.signOut();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('hirematch_demo_token');
    localStorage.removeItem('hirematch_demo_user');
    window.location.href = '/';
  }
}
