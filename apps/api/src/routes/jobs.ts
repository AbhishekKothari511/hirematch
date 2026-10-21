import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  createJobSchema,
  updateJobSchema,
  jobQuerySchema,
} from '@hirematch/shared';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { getSupabaseClient, getServiceRoleClient } from '../services/supabaseService';

const router = Router();

function getLocalSeedJobs(): any[] {
  try {
    const candidates = [
      path.resolve(__dirname, '../../../../scripts/seed-data/jobs.json'),
      path.resolve(process.cwd(), '../../scripts/seed-data/jobs.json'),
      path.resolve(process.cwd(), 'scripts/seed-data/jobs.json'),
      'c:/Users/Abhishek Kothari/Downloads/Projects/hirematch/scripts/seed-data/jobs.json',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data.jobs || [];
      }
    }
  } catch {
    // fallback failsafe
  }
  return [];
}

/**
 * GET /api/jobs
 * List jobs with full-text search, filtering, and pagination.
 * Open to public discovery for active jobs.
 */
router.get(
  '/',
  optionalAuth,
  validateQuery(jobQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        query,
        jobType,
        experienceLevel,
        location,
        skills,
        page = 1,
        limit = 20,
      } = req.query as any;

      const supabase = req.token ? getSupabaseClient(req.token) : getServiceRoleClient();
      const offset = (page - 1) * limit;

      let dbQuery = supabase
        .from('jobs')
        .select('*', { count: 'exact' })
        .eq('status', 'active');

      if (jobType) {
        dbQuery = dbQuery.eq('job_type', jobType);
      }

      if (experienceLevel) {
        dbQuery = dbQuery.eq('experience_level', experienceLevel);
      }

      if (location) {
        dbQuery = dbQuery.ilike('location', `%${location}%`);
      }

      if (skills) {
        const skillsArray = Array.isArray(skills) ? skills : [skills];
        dbQuery = dbQuery.contains('skills', skillsArray);
      }

      // Keyword search against tsvector or title
      if (query && query.trim() !== '') {
        dbQuery = dbQuery.textSearch('search_vector', query, {
          type: 'plain',
          config: 'english',
        });
      }

      dbQuery = dbQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: jobs, error, count } = await dbQuery;

      if (error) {
        // Fallback to local seed jobs (populated by JobGraph or HireMatch seed)
        const seedJobs = getLocalSeedJobs();
        let filtered = seedJobs;
        if (query && query.trim() !== '') {
          const q = query.toLowerCase();
          filtered = filtered.filter((j: any) =>
            (j.title && j.title.toLowerCase().includes(q)) ||
            (j.company && j.company.toLowerCase().includes(q)) ||
            (j.description && j.description.toLowerCase().includes(q))
          );
        }
        if (jobType) {
          filtered = filtered.filter((j: any) => (j.job_type || j.jobType) === jobType);
        }
        if (experienceLevel) {
          filtered = filtered.filter((j: any) => (j.experience_level || j.experienceLevel) === experienceLevel);
        }
        if (location) {
          const loc = location.toLowerCase();
          filtered = filtered.filter((j: any) => j.location && j.location.toLowerCase().includes(loc));
        }
        if (skills) {
          const skillsArray = Array.isArray(skills) ? skills : [skills];
          filtered = filtered.filter((j: any) =>
            Array.isArray(j.skills) && skillsArray.some((s: string) => j.skills.includes(s))
          );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const paginated = filtered.slice(offset, offset + limit);

        res.json({
          data: paginated,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        });
        return;
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      res.json({
        data: jobs || [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/jobs/:id
 * Retrieve a single job posting by ID.
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const supabase = req.token ? getSupabaseClient(req.token) : getServiceRoleClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      const seedJobs = getLocalSeedJobs();
      const localJob = seedJobs.find((j: any) => j.id === id);
      if (localJob) {
        res.json({ data: localJob });
        return;
      }
      res.status(404).json({ error: 'Not Found', message: `Job with ID '${id}' not found` });
      return;
    }

    res.json({ data: job });
  } catch (err: any) {
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/jobs
 * Create a new job posting.
 * Restricted to authenticated users with role: recruiter or admin.
 */
router.post(
  '/',
  requireAuth,
  requireRole(['recruiter', 'admin']),
  validateBody(createJobSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobData = req.body;
      const supabase = getSupabaseClient(req.token);

      const payload = {
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        job_type: jobData.jobType,
        experience_level: jobData.experienceLevel,
        description: jobData.description,
        requirements: jobData.requirements,
        skills: jobData.skills,
        salary_min: jobData.salaryMin ?? null,
        salary_max: jobData.salaryMax ?? null,
        salary_currency: jobData.salaryCurrency || 'USD',
        status: jobData.status || 'active',
      };

      const { data: job, error } = await supabase
        .from('jobs')
        .insert(payload)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: 'Database Error', message: error.message });
        return;
      }

      res.status(201).json({
        message: 'Job posting created successfully',
        data: job,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PUT /api/jobs/:id
 * Update an existing job posting.
 * Restricted to authenticated users with role: recruiter or admin.
 */
router.put(
  '/:id',
  requireAuth,
  requireRole(['recruiter', 'admin']),
  validateBody(updateJobSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const jobData = req.body;
      const supabase = getSupabaseClient(req.token);

      const updatePayload: Record<string, any> = {};
      if (jobData.title !== undefined) updatePayload.title = jobData.title;
      if (jobData.company !== undefined) updatePayload.company = jobData.company;
      if (jobData.location !== undefined) updatePayload.location = jobData.location;
      if (jobData.jobType !== undefined) updatePayload.job_type = jobData.jobType;
      if (jobData.experienceLevel !== undefined) updatePayload.experience_level = jobData.experienceLevel;
      if (jobData.description !== undefined) updatePayload.description = jobData.description;
      if (jobData.requirements !== undefined) updatePayload.requirements = jobData.requirements;
      if (jobData.skills !== undefined) updatePayload.skills = jobData.skills;
      if (jobData.salaryMin !== undefined) updatePayload.salary_min = jobData.salaryMin;
      if (jobData.salaryMax !== undefined) updatePayload.salary_max = jobData.salaryMax;
      if (jobData.salaryCurrency !== undefined) updatePayload.salary_currency = jobData.salaryCurrency;
      if (jobData.status !== undefined) updatePayload.status = jobData.status;

      const { data: job, error } = await supabase
        .from('jobs')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: 'Database Error', message: error.message });
        return;
      }

      res.json({
        message: 'Job posting updated successfully',
        data: job,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * DELETE /api/jobs/:id
 * Delete or archive a job posting.
 * Restricted to authenticated users with role: recruiter or admin.
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole(['recruiter', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = getSupabaseClient(req.token);

      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', id);

      if (error) {
        res.status(500).json({ error: 'Database Error', message: error.message });
        return;
      }

      res.json({
        message: 'Job posting deleted successfully',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

export default router;
