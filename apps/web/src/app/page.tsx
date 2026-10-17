import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
          🚀 Next-Gen AI Recruitment Architecture
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Where Top Tech Talent Meets Their{' '}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Semantic Match
          </span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Upload your resume and get matched to jobs using pgvector HNSW semantic embeddings and full-text GIN search merged via Reciprocal Rank Fusion ($k=60$). An LLM breaks down exactly why each job fits.
        </p>

        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link
            href="/resumes"
            className="px-6 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition"
          >
            Upload Resume & Get Matched
          </Link>
          <Link
            href="/jobs"
            className="px-6 py-3.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Browse 200+ Jobs (SSR)
          </Link>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid md:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
            ⚡
          </div>
          <h3 className="font-bold text-lg text-slate-900">Hybrid Search Engine</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Combines pgvector HNSW dense vectors with PostgreSQL tsvector full-text search using Reciprocal Rank Fusion (k=60) inside a single SQL function.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold">
            🧠
          </div>
          <h3 className="font-bold text-lg text-slate-900">LLM Fit Explanation</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every match is accompanied by structured JSON explanations highlighting concrete match reasons and candidate missing skills with single-retry remediation.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
            🔒
          </div>
          <h3 className="font-bold text-lg text-slate-900">Enterprise Security & GDPR</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Private AWS S3 pre-signed uploads unblock server event loops. Row-Level Security guarantees candidates can only view their own resumes and matches.
          </p>
        </div>
      </section>
    </div>
  );
}
