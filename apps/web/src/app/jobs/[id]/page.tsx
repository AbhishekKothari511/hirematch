import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Job } from '@hirematch/shared';

interface JobDetailPageProps {
  params: {
    id: string;
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = params;
  let job: Job | null = null;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const res = await fetch(`${apiUrl}/jobs/${id}`, {
      cache: 'no-store',
    });

    if (res.ok) {
      const json = await res.json();
      job = json.data;
    }
  } catch {
    // Fallback directly to seed data for local test rendering
    try {
      const seedData = require('../../../../../scripts/seed-data/jobs.json');
      job = (seedData.jobs as Job[]).find((j) => j.id === id) || null;
    } catch {
      job = null;
    }
  }

  if (!job) {
    notFound();
  }

  const jobType = job.jobType || (job as any).job_type;
  const expLevel = job.experienceLevel || (job as any).experience_level;
  const salMin = job.salaryMin ?? (job as any).salary_min;
  const salMax = job.salaryMax ?? (job as any).salary_max;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back button */}
      <div>
        <Link
          href="/jobs"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
        >
          ← Back to all jobs
        </Link>
      </div>

      {/* Header Card */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="text-sm font-bold text-indigo-600 uppercase tracking-wider">
              {job.company}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
              <span>📍 {job.location}</span>
              <span>•</span>
              <span className="capitalize font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {jobType}
              </span>
              <span>•</span>
              <span className="capitalize font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {expLevel} level
              </span>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3">
            <div className="text-right">
              {salMin && salMax ? (
                <div className="text-lg font-bold text-slate-900">
                  ${(salMin / 1000).toFixed(0)}k - ${(salMax / 1000).toFixed(0)}k
                  <span className="text-xs font-normal text-slate-500 block">per year</span>
                </div>
              ) : (
                <span className="text-sm font-semibold text-slate-500">Competitive Compensation</span>
              )}
            </div>

            <Link
              href={`/resumes`}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm transition"
            >
              Match My Resume
            </Link>
          </div>
        </div>
      </div>

      {/* Main Details Body */}
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          {/* Job Overview */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">About the Role</h2>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {job.description}
            </p>
          </section>

          {/* Requirements */}
          <section className="space-y-3 pt-4 border-t border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Key Requirements</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              {(job.requirements || []).map((req, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="text-indigo-600 font-bold mt-0.5">✓</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Required Skills & Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {(job.skills || []).map((skill) => (
                <span
                  key={skill}
                  className="text-xs font-medium px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-6 rounded-2xl border border-indigo-100 space-y-3">
            <h3 className="font-bold text-sm text-indigo-950">AI Semantic Match</h3>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Want to see if your experience matches this posting? Upload your resume to run hybrid semantic retrieval and receive an instant LLM fit breakdown.
            </p>
            <Link
              href="/resumes"
              className="block text-center text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              Analyze Resume Fit →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
