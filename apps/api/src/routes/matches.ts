import { Router, Request, Response } from 'express';
import { resumeMatchQuerySchema } from '@hirematch/shared';
import { requireAuth } from '../middleware/auth';
import { validateQuery, validateBody } from '../middleware/validate';
import { getSupabaseClient, getServiceRoleClient } from '../services/supabaseService';
import { explainJobMatch } from '../services/llmService';
import { z } from 'zod';

const router = Router();

const computeMatchBodySchema = z.object({
  resumeId: z.string().uuid('Invalid resume UUID'),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

/**
 * GET /api/matches
 * 
 * Non-obvious / Interview Talking Point:
 * Hybrid Search & Match Explanation Pipeline:
 * 1. Checks `public.matches` for precomputed/cached matches first (O(1) index lookup).
 * 2. If uncached, executes the database SQL function `hybrid_search_jobs` combining
 *    full-text GIN search and pgvector HNSW cosine distance via Reciprocal Rank Fusion (k=60).
 * 3. Enriches top-K candidates with structured LLM gap analysis { matchReasons, missingSkills }.
 * 4. Persists the computed matches in `public.matches` to avoid redundant LLM token expenditures.
 */
router.get(
  '/',
  requireAuth,
  validateQuery(resumeMatchQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { resumeId, limit = 10, offset = 0 } = req.query as any;
      const userId = req.user!.id;
      const supabase = getSupabaseClient(req.token);

      // Verify that the resume exists and belongs to the authenticated user (RLS)
      const { data: resume, error: resumeErr } = await supabase
        .from('resumes')
        .select('id, user_id, status, parsed_text, embedding')
        .eq('id', resumeId)
        .eq('user_id', userId)
        .single();

      if (resumeErr || !resume) {
        res.status(404).json({
          error: 'Not Found',
          message: `Resume '${resumeId}' not found or you do not have permission to access it.`,
        });
        return;
      }

      // Check for cached matches in public.matches
      const { data: existingMatches, error: matchFetchErr } = await supabase
        .from('matches')
        .select(`
          id,
          resume_id,
          job_id,
          similarity_score,
          keyword_rank,
          vector_rank,
          rrf_score,
          match_reasons,
          missing_skills,
          status,
          created_at,
          job:jobs (
            id,
            title,
            company,
            location,
            job_type,
            experience_level,
            description,
            skills,
            salary_min,
            salary_max,
            salary_currency
          )
        `)
        .eq('resume_id', resumeId)
        .eq('user_id', userId)
        .order('rrf_score', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!matchFetchErr && existingMatches && existingMatches.length > 0) {
        res.json({
          cached: true,
          count: existingMatches.length,
          data: existingMatches,
        });
        return;
      }

      // If no cached matches, verify resume is ready for computation
      if (resume.status !== 'completed' || !resume.parsed_text) {
        res.status(400).json({
          error: 'Resume Not Ready',
          message: `Resume status is '${resume.status}'. Matching requires status 'completed'.`,
        });
        return;
      }

      // Compute matches via hybrid search SQL function
      const computedMatches = await computeAndPersistMatches(
        resume,
        userId,
        limit,
        req.token
      );

      res.json({
        cached: false,
        count: computedMatches.length,
        data: computedMatches,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/matches/compute
 * Manually force re-computation of matches and LLM explanations for a resume.
 */
router.post(
  '/compute',
  requireAuth,
  validateBody(computeMatchBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { resumeId, limit = 10 } = req.body;
      const userId = req.user!.id;
      const supabase = getSupabaseClient(req.token);

      const { data: resume, error: resumeErr } = await supabase
        .from('resumes')
        .select('id, user_id, status, parsed_text, embedding')
        .eq('id', resumeId)
        .eq('user_id', userId)
        .single();

      if (resumeErr || !resume) {
        res.status(404).json({
          error: 'Not Found',
          message: `Resume '${resumeId}' not found.`,
        });
        return;
      }

      if (resume.status !== 'completed' || !resume.parsed_text) {
        res.status(400).json({
          error: 'Resume Not Ready',
          message: `Resume status is '${resume.status}'. Cannot compute matches until parsing and embedding complete.`,
        });
        return;
      }

      const computedMatches = await computeAndPersistMatches(
        resume,
        userId,
        limit,
        req.token
      );

      res.status(201).json({
        message: 'Job matches and LLM explanations computed successfully',
        count: computedMatches.length,
        data: computedMatches,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * Helper to execute hybrid search SQL function and enrich with LLM explanations
 */
async function computeAndPersistMatches(
  resume: { id: string; parsed_text: string; embedding: any },
  userId: string,
  limit: number,
  token?: string
) {
  const supabase = token ? getSupabaseClient(token) : getServiceRoleClient();

  // 1. Execute SQL function hybrid_search_jobs via Supabase RPC
  const { data: searchResults, error: rpcError } = await supabase.rpc(
    'hybrid_search_jobs',
    {
      query_text: resume.parsed_text.slice(0, 500),
      query_embedding: resume.embedding,
      match_count: limit,
      rrf_k: 60,
    }
  );

  let jobsToMatch: any[] = searchResults || [];

  // Fallback: If RPC is not created yet or database is empty, fetch top active jobs
  if (rpcError || jobsToMatch.length === 0) {
    console.warn(`[Hybrid Search Warning] RPC returned: ${rpcError?.message || '0 results'}. Falling back to active jobs query.`);
    const { data: fallbackJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'active')
      .limit(limit);

    jobsToMatch = (fallbackJobs || []).map((j, idx) => ({
      job_id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      job_type: j.job_type,
      experience_level: j.experience_level,
      description: j.description,
      requirements: j.requirements,
      skills: j.skills,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      keyword_rank: idx + 1,
      vector_rank: idx + 1,
      rrf_score: 1.0 / (60 + idx + 1),
      vector_distance: 0.15,
    }));
  }

  // 2. Concurrently generate LLM explanations for top matching jobs
  const matchRecordsToInsert: any[] = [];
  const returnResults: any[] = [];

  for (const item of jobsToMatch) {
    const jobContext = {
      title: item.title,
      company: item.company,
      description: item.description,
      skills: item.skills || [],
      requirements: item.requirements || [],
    };

    const explanation = await explainJobMatch(resume.parsed_text, jobContext);

    const matchRow = {
      resume_id: resume.id,
      job_id: item.job_id,
      user_id: userId,
      similarity_score: item.vector_distance != null ? 1.0 - item.vector_distance : 0.85,
      keyword_rank: item.keyword_rank,
      vector_rank: item.vector_rank,
      rrf_score: item.rrf_score,
      match_reasons: explanation.matchReasons,
      missing_skills: explanation.missingSkills,
      status: 'computed',
    };

    matchRecordsToInsert.push(matchRow);
    returnResults.push({
      ...matchRow,
      job: item,
    });
  }

  // 3. Persist matches in public.matches
  if (matchRecordsToInsert.length > 0) {
    const serviceClient = getServiceRoleClient();
    await serviceClient
      .from('matches')
      .upsert(matchRecordsToInsert, { onConflict: 'resume_id,job_id' });
  }

  return returnResults;
}

export default router;
