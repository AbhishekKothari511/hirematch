import { z } from 'zod';

export const userRoleEnum = z.enum(['student', 'recruiter', 'admin']);

export const updateUserProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  role: userRoleEnum.optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
