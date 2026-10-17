import { z } from 'zod';

export const applicationStatusEnum = z.enum([
  'submitted',
  'under_review',
  'interviewing',
  'accepted',
  'rejected',
]);

export const createApplicationSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
  resumeId: z.string().uuid('Invalid resume ID'),
  coverNote: z
    .string()
    .max(2000, 'Cover note cannot exceed 2000 characters')
    .optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: applicationStatusEnum,
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;
