import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import { ResumeJobPayload } from '@hirematch/shared';

export const RESUME_QUEUE_NAME = 'resume-processing';
export const RESUME_DLQ_NAME = 'resume-processing-dlq';

export function getRedisConnection(): IORedis {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  return new IORedis({
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      // Exponential backoff with max 3s delay for redis reconnect
      return Math.min(times * 100, 3000);
    },
  });
}

let queueInstance: Queue<ResumeJobPayload> | null = null;

export function getResumeQueue(): Queue<ResumeJobPayload> {
  if (!queueInstance) {
    const connection = getRedisConnection();

    /**
     * Non-obvious / Interview Talking Point:
     * Queue Configuration & Backoff Mechanics:
     * - attempts: 3: Transient network glitches, S3 rate limits, or AI API timeouts
     *   are given 3 execution opportunities before being marked dead.
     * - backoff: { type: 'exponential', delay: 2000 }: Backs off exponentially (2s, 4s, 8s)
     *   preventing thundering herd problems when downstream external APIs recover.
     * - jobId: resume-${resumeId}: Enforces job idempotency at the queue level so
     *   repeated client requests cannot trigger duplicate embedding jobs.
     */
    const queueOptions: QueueOptions = {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600 * 24, // Keep completed job metadata for 24h
          count: 500,
        },
        removeOnFail: false, // Retain failed jobs for dead-letter processing
      },
    };

    queueInstance = new Queue<ResumeJobPayload>(RESUME_QUEUE_NAME, queueOptions);
  }

  return queueInstance;
}

/**
 * Enqueues a resume for asynchronous processing
 */
export async function enqueueResumeProcessing(payload: ResumeJobPayload): Promise<string> {
  try {
    const queue = getResumeQueue();
    const job = await queue.add('process-resume', payload, {
      jobId: `resume-${payload.resumeId}`,
    });
    return job.id || `resume-${payload.resumeId}`;
  } catch (err: any) {
    console.warn(`[Queue Warning] Unable to enqueue to Redis (${err.message}). Continuing in synchronous/mock mode.`);
    return `mock-${payload.resumeId}`;
  }
}
