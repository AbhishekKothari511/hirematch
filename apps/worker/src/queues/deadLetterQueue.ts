import { Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { ResumeJobPayload, DeadLetterJobPayload } from '@hirematch/shared';
import { env } from '../config/env';
import { getWorkerSupabaseClient } from '../services/supabaseService';

export const RESUME_DLQ_NAME = 'resume-processing-dlq';

let dlqInstance: Queue<DeadLetterJobPayload> | null = null;

function getRedisConnection(): IORedis {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getDeadLetterQueue(): Queue<DeadLetterJobPayload> {
  if (!dlqInstance) {
    dlqInstance = new Queue<DeadLetterJobPayload>(RESUME_DLQ_NAME, {
      connection: getRedisConnection(),
    });
  }
  return dlqInstance;
}

/**
 * Routes a permanently failed job to the Dead-Letter Queue (DLQ)
 * and updates the resume record in PostgreSQL to 'failed'.
 * 
 * Non-obvious / Interview Talking Point:
 * Why a Dead-Letter Queue (DLQ)?
 * 1. Poison Pill Containment: Corrupted PDFs, scanned images without OCR text, or malformed
 *    S3 keys would otherwise crash or exhaust retries. Routing to a DLQ isolates the bad
 *    job without dropping data.
 * 2. Operational Visibility: Engineers can inspect DLQ jobs, view exact failure reasons,
 *    patch parsers or alert candidates, and replay jobs with a single CLI/script command.
 * 3. Graceful User Feedback: Immediately updates the candidate's UI status to 'failed'
 *    with a human-readable explanation instead of leaving the resume in eternal 'pending'.
 */
export async function routeToDeadLetterQueue(
  job: Job<ResumeJobPayload>,
  error: Error
): Promise<void> {
  const payload: DeadLetterJobPayload = {
    originalJobId: job.id || 'unknown',
    queueName: job.queueName,
    payload: job.data,
    failedReason: error.message || 'Unknown processing failure',
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
  };

  try {
    const dlq = getDeadLetterQueue();
    await dlq.add('dead-letter-resume', payload, {
      removeOnComplete: false, // Keep DLQ history for debugging
      removeOnFail: false,
    });
    console.warn(`[DLQ] Job ${job.id} routed to '${RESUME_DLQ_NAME}': ${payload.failedReason}`);
  } catch (dlqErr: any) {
    console.error(`[DLQ Error] Failed to write to DLQ Redis: ${dlqErr.message}`);
  }

  // Update resume status in Supabase to 'failed'
  try {
    const supabase = getWorkerSupabaseClient();
    await supabase
      .from('resumes')
      .update({
        status: 'failed',
        error_message: error.message || 'Processing failed after maximum retry attempts',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.data.resumeId);
  } catch (dbErr: any) {
    console.error(`[DB Error] Failed to mark resume ${job.data.resumeId} as failed:`, dbErr.message);
  }
}
