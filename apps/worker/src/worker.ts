import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { ResumeJobPayload } from '@hirematch/shared';
import { env } from './config/env';
import { processResumeJob } from './processors/resumeProcessor';
import { routeToDeadLetterQueue } from './queues/deadLetterQueue';

export const QUEUE_NAME = 'resume-processing';

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });
}

export function startWorker(): Worker<ResumeJobPayload> {
  const connection = createRedisConnection();

  console.log('====================================================');
  console.log('👷 HireMatch BullMQ Resume Worker Initializing');
  console.log(`🔌 Redis Target: ${env.REDIS_HOST}:${env.REDIS_PORT}`);
  console.log(`📦 Queue Name: ${QUEUE_NAME}`);
  console.log(`⚡ Concurrency: ${env.WORKER_CONCURRENCY}`);
  console.log(`🧠 Embedding Model: ${env.EMBEDDING_MODEL_NAME} (${env.EMBEDDING_DIMENSION} dims)`);
  console.log('====================================================\n');

  const worker = new Worker<ResumeJobPayload>(
    QUEUE_NAME,
    async (job: Job<ResumeJobPayload>) => {
      return await processResumeJob(job);
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  // Success listener
  worker.on('completed', (job: Job<ResumeJobPayload>, result) => {
    console.log(`[Worker Completed] Job ${job.id} finished in ${result.durationMs}ms`);
  });

  // Failure listener (retries and dead-letter queue routing)
  worker.on('failed', async (job: Job<ResumeJobPayload> | undefined, error: Error) => {
    if (!job) {
      console.error('[Worker Failed] Unknown job failed:', error);
      return;
    }

    const attemptsMax = job.opts.attempts || 3;
    console.error(
      `[Worker Failed] Job ${job.id} failed on attempt ${job.attemptsMade}/${attemptsMax}: ${error.message}`
    );

    // If max retry attempts reached, route poison pill to Dead-Letter Queue
    if (job.attemptsMade >= attemptsMax) {
      console.warn(`[Worker DLQ Alert] Job ${job.id} exhausted all ${attemptsMax} attempts. Escalating to DLQ...`);
      await routeToDeadLetterQueue(job, error);
    }
  });

  worker.on('error', (err) => {
    console.error('[Worker System Error]:', err);
  });

  const shutdown = async () => {
    console.log('\n🛑 Worker received termination signal. Closing BullMQ worker...');
    await worker.close();
    console.log('⚡ Worker closed gracefully.');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return worker;
}

if (require.main === module) {
  startWorker();
}
