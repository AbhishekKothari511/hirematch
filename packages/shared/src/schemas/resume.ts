import { z } from 'zod';

export const resumeStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const getSignedUploadUrlSchema = z.object({
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name too long')
    .regex(/\.pdf$/i, 'Only PDF files are supported'),
  fileSizeBytes: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(10 * 1024 * 1024, 'Resume file size cannot exceed 10 MB'),
  mimeType: z.literal('application/pdf'),
});

export const resumeUploadConfirmationSchema = z.object({
  s3Key: z.string().min(5, 'Invalid S3 key'),
  fileName: z.string().min(1, 'File name is required'),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.literal('application/pdf'),
});

export const deleteResumeSchema = z.object({
  resumeId: z.string().uuid('Invalid resume ID'),
});

export type GetSignedUploadUrlInput = z.infer<typeof getSignedUploadUrlSchema>;
export type ResumeUploadConfirmationInput = z.infer<typeof resumeUploadConfirmationSchema>;
export type DeleteResumeInput = z.infer<typeof deleteResumeSchema>;
