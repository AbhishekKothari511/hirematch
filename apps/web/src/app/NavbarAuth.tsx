'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBrowserSupabase } from '@/lib/supabaseClient';

export default function NavbarAuth() {
  const [user, setUser] = useState<{ fullName?: string; email?: string } | null>(null);

  useEffect(() => {
    // Check localStorage demo user
    const checkUser = () => {
      const stored = localStorage.getItem('hirematch_demo_user');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
          return;
        } catch {}
      }

      // Check Supabase session
      try {
        const supabase = getBrowserSupabase();
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setUser({
              email: session.user.email,
              fullName: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
            });
          }
        });
      } catch {}
    };

    checkUser();

    // Listen for storage changes across tabs or login events
    window.addEventListener('storage', checkUser);
    return () => window.removeEventListener('storage', checkUser);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('hirematch_demo_token');
    localStorage.removeItem('hirematch_demo_user');
    try {
      const supabase = getBrowserSupabase();
      supabase.auth.signOut();
    } catch {}
    setUser(null);
    window.location.href = '/';
  };

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{user.fullName || user.email || 'Abhishek Kothari'}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs font-medium text-slate-500 hover:text-red-600 px-2 py-1 transition"
        >
          Sign Out
        </button>
        <Link
          href="/resumes"
          className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
        >
          Upload Resume
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        className="text-sm font-medium text-slate-700 hover:text-indigo-600 px-3 py-1.5 transition"
      >
        Sign In
      </Link>
      <Link
        href="/resumes"
        className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
      >
        Upload Resume
      </Link>
    </div>
  );
}
