import Link from 'next/link';
import { Job } from '@hirematch/shared';

interface JobsPageProps {
  searchParams: {
    query?: string;
    jobType?: string;
    experienceLevel?: string;
    page?: string;
  };
}

/**
 * Public SSR Job Catalog Page
 * 
 * Non-obvious / Interview Talking Point:
 * Why Server-Side Rendering (SSR) for the Job Catalog?
 * 1. SEO & Crawlability: Public job postings are rendered on the server with full HTML,
 *    allowing Googlebot and job aggregators to index content without running client JS.
 * 2. Instant First Contentful Paint (FCP): Visitors receive fully rendered HTML and CSS
 *    immediately on initial HTTP GET, avoiding blank-screen loading spinners.
 * 3. Shared Types: Consumes identical `Job` interfaces from `@hirematch/shared`.
 */
export default async function JobsPage({ searchParams }: JobsPageProps) {
  const query = searchParams.query || '';
  const jobType = searchParams.jobType || '';
  const experienceLevel = searchParams.experienceLevel || '';
  const page = parseInt(searchParams.page || '1', 10);
  const limit = 12;

  // Fetch jobs server-side
  let jobs: Job[] = [];
  let totalJobs = 0;
  let totalPages = 1;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (jobType) params.set('jobType', jobType);
    if (experienceLevel) params.set('experienceLevel', experienceLevel);
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    const res = await fetch(`${apiUrl}/jobs?${params.toString()}`, {
      cache: 'no-store', // Always dynamic SSR
    });

    if (res.ok) {
      const data = await res.json();
      jobs = data.data || [];
      totalJobs = data.pagination?.total || jobs.length;
      totalPages = data.pagination?.totalPages || 1;
    }
  } catch {
    // If Express is offline during local test render, load directly from seed data
    try {
      const seedData = require('../../../../scripts/seed-data/jobs.json');
      let filtered = seedData.jobs as Job[];
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(
          (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
        );
      }
      if (jobType) filtered = filtered.filter((j: any) => j.jobType === jobType || j.job_type === jobType);
      if (experienceLevel) filtered = filtered.filter((j: any) => j.experienceLevel === experienceLevel || j.experience_level === experienceLevel);

      totalJobs = filtered.length;
      totalPages = Math.ceil(totalJobs / limit);
      jobs = filtered.slice((page - 1) * limit, page * limit);
    } catch {
      jobs = [];
    }
  }

  const jobTypes = ['all', 'full-time', 'internship', 'remote', 'contract'];
  const expLevels = ['all', 'entry', 'mid', 'senior'];

  return (
    <div className="space-y-8">
      {/* Header & Search */}
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Explore Job Opportunities
        </h1>
        <p className="text-sm text-slate-600">
          Showing {jobs.length} of {totalJobs} active roles across top tech companies
        </p>

        {/* Filter Bar */}
        <form method="GET" action="/jobs" className="flex flex-col sm:flex-row gap-3 pt-2">
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="Search by title, company, or skills (e.g., Next.js, Postgres)..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            Search
          </button>
        </form>

        {/* Filters: Job Type */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="font-semibold text-slate-500 mr-2">Job Type:</span>
          {jobTypes.map((t) => {
            const isActive = (!jobType && t === 'all') || jobType === t;
            const newParams = new URLSearchParams();
            if (query) newParams.set('query', query);
            if (t !== 'all') newParams.set('jobType', t);
            if (experienceLevel) newParams.set('experienceLevel', experienceLevel);
            return (
              <Link
                key={t}
                href={`/jobs?${newParams.toString()}`}
                className={`px-3 py-1.5 rounded-lg border font-medium capitalize transition ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {t}
              </Link>
            );
          })}
        </div>

        {/* Filters: Experience Level */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-500 mr-2">Experience:</span>
          {expLevels.map((lvl) => {
            const isActive = (!experienceLevel && lvl === 'all') || experienceLevel === lvl;
            const newParams = new URLSearchParams();
            if (query) newParams.set('query', query);
            if (jobType) newParams.set('jobType', jobType);
            if (lvl !== 'all') newParams.set('experienceLevel', lvl);
            return (
              <Link
                key={lvl}
                href={`/jobs?${newParams.toString()}`}
                className={`px-3 py-1.5 rounded-lg border font-medium capitalize transition ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {lvl}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Jobs Grid */}
      {jobs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
          No jobs found matching your criteria. Try adjusting your search keywords.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                    {job.company}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">
                    {job.jobType || (job as any).job_type}
                  </span>
                </div>

                <h3 className="font-bold text-base text-slate-900 line-clamp-2">
                  <Link href={`/jobs/${job.id}`} className="hover:text-indigo-600 transition">
                    {job.title}
                  </Link>
                </h3>

                <p className="text-xs text-slate-500 flex items-center gap-1">
                  📍 {job.location}
                </p>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  {job.description}
                </p>

                {/* Skills Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(job.skills || []).slice(0, 4).map((skill) => (
                    <span
                      key={skill}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                  {(job.skills || []).length > 4 && (
                    <span className="text-[11px] text-slate-400">
                      +{(job.skills || []).length - 4} more
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900">
                  {job.salaryMin || (job as any).salary_min ? (
                    <span>
                      ${((job.salaryMin || (job as any).salary_min) / 1000).toFixed(0)}k - $
                      {((job.salaryMax || (job as any).salary_max) / 1000).toFixed(0)}k
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">Salary Competitive</span>
                  )}
                </div>

                <Link
                  href={`/jobs/${job.id}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                >
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-6">
          {page > 1 && (
            <Link
              href={`/jobs?page=${page - 1}&query=${query}&jobType=${jobType}&experienceLevel=${experienceLevel}`}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Previous
            </Link>
          )}
          <span className="text-xs text-slate-500 font-medium px-3">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/jobs?page=${page + 1}&query=${query}&jobType=${jobType}&experienceLevel=${experienceLevel}`}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
