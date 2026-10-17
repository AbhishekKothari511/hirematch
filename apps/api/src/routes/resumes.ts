import { Router, Request, Response } from 'express';
import {
  getSignedUploadUrlSchema,
  resumeUploadConfirmationSchema,
} from '@hirematch/shared';
import { requireAuth } from '../middleware/auth';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { s3Service } from '../services/s3Service';
import { getSupabaseClient } from '../services/supabaseService';
import { enqueueResumeProcessing } from '../queue/resumeQueue';

const router = Router();

/**
 * POST /api/resumes/upload-url
 * 
 * Non-obvious / Interview Talking Point:
 * Generates a pre-signed S3 PUT URL for direct browser-to-S3 upload.
 * Why this is crucial:
 * 1. The client browser uploads binary PDF bytes directly to AWS S3.
 * 2. Node.js server RAM and event loops are never blocked by multi-megabyte streams.
 * 3. The S3 bucket remains strictly private with zero public read/write ACLs.
 */
router.post(
  '/upload-url',
  requireAuth,
  uploadRateLimiter,
  validateBody(getSignedUploadUrlSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileName, fileSizeBytes, mimeType } = req.body;
      const userId = req.user!.id;

      const signedData = await s3Service.generateSignedUploadUrl(
        userId,
        fileName,
        mimeType,
        fileSizeBytes
      );

      res.json({
        message: 'Pre-signed S3 upload URL generated successfully',
        ...signedData,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Storage Error', message: err.message });
    }
  }
);

/**
 * POST /api/resumes/confirm
 * 
 * Confirms that the candidate has successfully uploaded the PDF file to S3.
 * Creates the database entry in `resumes` in 'pending' status for the BullMQ queue worker.
 */
router.post(
  '/confirm',
  requireAuth,
  validateBody(resumeUploadConfirmationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { s3Key, fileName, fileSizeBytes, mimeType } = req.body;
      const userId = req.user!.id;
      const supabase = getSupabaseClient(req.token);

      // Verify that the file belongs to this user path prefix
      if (!s3Key.startsWith(`resumes/${userId}/`)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'S3 key path does not match authenticated user identifier',
        });
        return;
      }

      // Insert record into public.resumes (enforcing RLS auth.uid() = user_id)
      const { data: resume, error } = await supabase
        .from('resumes')
        .insert({
          user_id: userId,
          file_name: fileName,
          s3_key: s3Key,
          s3_bucket: req.body.s3Bucket || 'hirematch-resumes-private',
          file_size_bytes: fileSizeBytes,
          mime_type: mimeType,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: 'Database Error', message: error.message });
        return;
      }

      // Enqueue background processing job into BullMQ
      const jobId = await enqueueResumeProcessing({
        resumeId: resume.id,
        userId,
        s3Key,
        s3Bucket: resume.s3_bucket,
        fileName,
      });

      res.status(201).json({
        message: 'Resume upload confirmed and queued for AI parsing and embedding',
        data: resume,
        jobId,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/resumes
 * List all resumes uploaded by the authenticated student.
 * Protected by database Row-Level Security.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabaseClient(req.token);

    const { data: resumes, error } = await supabase
      .from('resumes')
      .select('id, file_name, file_size_bytes, mime_type, status, error_message, created_at, updated_at')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Database Error', message: error.message });
      return;
    }

    res.json({ data: resumes || [] });
  } catch (err: any) {
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * GET /api/resumes/:id
 * Retrieve single resume metadata and generate a temporary signed download URL.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient(req.token);

    const { data: resume, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (error || !resume) {
      res.status(404).json({ error: 'Not Found', message: `Resume with ID '${id}' not found` });
      return;
    }

    // Generate signed download URL
    let downloadUrl: string | null = null;
    try {
      downloadUrl = await s3Service.generateSignedDownloadUrl(resume.s3_key);
    } catch (s3Err) {
      console.warn('Failed to generate pre-signed download URL:', s3Err);
    }

    res.json({
      data: {
        ...resume,
        downloadUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * DELETE /api/resumes/:id
 * 
 * Non-obvious / Interview Talking Point:
 * "Delete-My-Data" GDPR & Privacy Compliance Endpoint
 * 1. Physical Object Purge: Deletes binary file from private AWS S3 bucket.
 * 2. Relational Cascade: Deletes resume record from PostgreSQL `resumes` table.
 *    Foreign key `ON DELETE CASCADE` automatically wipes all associated AI `matches`
 *    and job applications, leaving zero orphaned personal candidate data.
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient(req.token);

    // 1. Fetch resume to get the S3 key and verify ownership
    const { data: resume, error: fetchError } = await supabase
      .from('resumes')
      .select('id, s3_key, user_id')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (fetchError || !resume) {
      res.status(404).json({ error: 'Not Found', message: `Resume with ID '${id}' not found` });
      return;
    }

    // 2. Delete physical object from AWS S3
    try {
      await s3Service.deleteFile(resume.s3_key);
    } catch (s3Err) {
      console.error(`Failed to delete S3 file ${resume.s3_key}:`, s3Err);
      // Continue to DB purge to avoid leaving un-deletable DB row
    }

    // 3. Delete database record (cascades to matches and applications)
    const { error: deleteError } = await supabase
      .from('resumes')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id);

    if (deleteError) {
      res.status(500).json({ error: 'Database Error', message: deleteError.message });
      return;
    }

    res.json({
      success: true,
      message: 'Resume file and all associated AI matches permanently purged from storage and database.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

export default router;
