import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'HireMatch - AI Semantic Job Matching Platform',
  description: 'AI job-matching platform using hybrid search (pgvector + full-text) and LLM-powered fit explanations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 flex flex-col min-h-screen">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  HireMatch
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  AI Hybrid Search
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
                <Link href="/jobs" className="hover:text-indigo-600 transition">
                  Explore Jobs
                </Link>
                <Link href="/resumes" className="hover:text-indigo-600 transition">
                  Upload Resume
                </Link>
                <Link href="/matches" className="hover:text-indigo-600 transition">
                  AI Matches
                </Link>
              </nav>
            </div>

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
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4">
            <p>
              HireMatch · Full Stack AI Job Matching Architecture · Powered by Next.js, Express, Supabase, pgvector HNSW, and BullMQ
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
