import { z } from 'zod';

export const jobTypeEnum = z.enum([
  'full-time',
  'part-time',
  'internship',
  'contract',
  'remote',
]);

export const experienceLevelEnum = z.enum([
  'entry',
  'mid',
  'senior',
  'lead',
]);

export const jobStatusEnum = z.enum([
  'draft',
  'active',
  'archived',
  'closed',
]);

export const baseJobSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters')
    .trim(),
  company: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name cannot exceed 100 characters')
    .trim(),
  location: z
    .string()
    .min(2, 'Location must be at least 2 characters')
    .max(100, 'Location cannot exceed 100 characters')
    .trim(),
  jobType: jobTypeEnum,
  experienceLevel: experienceLevelEnum,
  description: z
    .string()
    .min(30, 'Job description must be at least 30 characters')
    .trim(),
  requirements: z
    .array(z.string().min(2).trim())
    .min(1, 'At least one requirement is required')
    .max(20, 'Maximum 20 requirements allowed'),
  skills: z
    .array(z.string().min(1).trim())
    .min(1, 'At least one skill is required')
    .max(30, 'Maximum 30 skills allowed'),
  salaryMin: z.number().int().nonnegative().nullable().optional(),
  salaryMax: z.number().int().nonnegative().nullable().optional(),
  salaryCurrency: z.string().length(3).default('USD'),
  status: jobStatusEnum.default('active'),
});

const validateSalaryRange = (data: { salaryMin?: number | null; salaryMax?: number | null }) => {
  if (data.salaryMin != null && data.salaryMax != null) {
    return data.salaryMin <= data.salaryMax;
  }
  return true;
};

export const createJobSchema = baseJobSchema.refine(validateSalaryRange, {
  message: 'salaryMin cannot be greater than salaryMax',
  path: ['salaryMin'],
});

export const updateJobSchema = baseJobSchema.partial().refine(validateSalaryRange, {
  message: 'salaryMin cannot be greater than salaryMax',
  path: ['salaryMin'],
});

export const jobQuerySchema = z.object({
  query: z.string().optional(),
  jobType: jobTypeEnum.optional(),
  experienceLevel: experienceLevelEnum.optional(),
  location: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobQueryParams = z.infer<typeof jobQuerySchema>;
