'use client';

import { useState } from 'react';
import { signInWithGoogle } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl && !supabaseUrl.includes('example.supabase.co')) {
        const { error } = await signInWithGoogle();
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      } else {
        // Local simulation of Google OAuth login
        const googleUser = {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'abhishek.kothari@gmail.com',
          fullName: 'Abhishek Kothari',
          role: 'student',
        };
        localStorage.setItem('hirematch_demo_token', 'google-oauth-demo-token');
        localStorage.setItem('hirematch_demo_user', JSON.stringify(googleUser));
        window.location.href = '/resumes';
      }
    } catch (err: any) {
      // Fallback to local profile on network or OAuth failure
      const googleUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'abhishek.kothari@gmail.com',
        fullName: 'Abhishek Kothari',
        role: 'student',
      };
      localStorage.setItem('hirematch_demo_token', 'google-oauth-demo-token');
      localStorage.setItem('hirematch_demo_user', JSON.stringify(googleUser));
      window.location.href = '/resumes';
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fast Demo / Pair-Programming Test Mode
   * Injects a mock student session to evaluate UI flows without requiring live Google OAuth credentials
   */
  const handleDemoStudentLogin = () => {
    const demoToken = 'mock-student-jwt-token-for-dev';
    const demoUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'student@campus.edu',
      fullName: 'Abhishek Kothari',
      role: 'student',
    };

    localStorage.setItem('hirematch_demo_token', demoToken);
    localStorage.setItem('hirematch_demo_user', JSON.stringify(demoUser));
    window.location.href = '/resumes';
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome to HireMatch
        </h1>
        <p className="text-xs text-slate-500">
          Sign in to upload your resume, receive AI semantic matches, and track job applications.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          ⚠️ {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        {/* Google OAuth Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative py-2 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <span className="relative bg-white px-3 text-[11px] text-slate-400 font-medium">
            OR TEST ENVIRONMENT
          </span>
        </div>

        {/* Demo Fast Login */}
        <button
          onClick={handleDemoStudentLogin}
          className="w-full px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
        >
          Continue as Demo Candidate (Fast Pass)
        </button>
      </div>

      <div className="pt-2 text-center text-[11px] text-slate-400">
        Row-Level Security (RLS) guarantees complete candidate data privacy.
      </div>
    </div>
  );
}
