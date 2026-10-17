import { z } from 'zod';

export const matchExplanationSchema = z.object({
  matchReasons: z
    .array(z.string().min(3))
    .min(1, 'At least one match reason is required')
    .max(5, 'At most 5 match reasons allowed'),
  missingSkills: z
    .array(z.string().min(1))
    .max(10, 'At most 10 missing skills allowed'),
});

export const hybridSearchQuerySchema = z.object({
  queryText: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  jobType: z.string().optional(),
  experienceLevel: z.string().optional(),
  rrfK: z.coerce.number().int().min(1).default(60),
});

export const resumeMatchQuerySchema = z.object({
  resumeId: z.string().uuid('Invalid resume UUID'),
  limit: z.coerce.number().int().min(1).max(30).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MatchExplanationData = z.infer<typeof matchExplanationSchema>;
export type HybridSearchQueryParams = z.infer<typeof hybridSearchQuerySchema>;
export type ResumeMatchQueryParams = z.infer<typeof resumeMatchQuerySchema>;
