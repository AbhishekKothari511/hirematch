import { Job } from 'bullmq';
import { ResumeJobPayload } from '@hirematch/shared';
import { s3Downloader } from '../services/s3DownloaderService';
import { parsePdfBuffer } from '../services/pdfParserService';
import { generateTextEmbedding } from '../services/embeddingService';
import { getWorkerSupabaseClient } from '../services/supabaseService';

export interface ProcessingResult {
  success: boolean;
  resumeId: string;
  textLength: number;
  embeddingDimensions: number;
  pages: number;
  durationMs: number;
}

/**
 * BullMQ Resume Ingestion Processor
 * 
 * Pipeline:
 * 1. Mark resume status = 'processing'
 * 2. Download PDF bytes from private AWS S3
 * 3. Extract text and clean glyphs via pdf-parse
 * 4. Generate high-dimensional vector embedding
 * 5. Persist parsed text, embedding vector, and status = 'completed' in Supabase
 */
export async function processResumeJob(
  job: Job<ResumeJobPayload>
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const { resumeId, s3Key, s3Bucket, fileName } = job.data;
  const supabase = getWorkerSupabaseClient();

  console.log(`[Worker] Starting job ${job.id} for resume ${resumeId} (Attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`);

  // Step 1: Update status to 'processing'
  try {
    await supabase
      .from('resumes')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resumeId);
  } catch (err: any) {
    console.warn(`[Worker DB Notice] Could not update status to processing: ${err.message}`);
  }

  // Step 2: Download PDF from AWS S3
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await s3Downloader.downloadObjectToBuffer(s3Bucket, s3Key);
    console.log(`[Worker] Downloaded ${pdfBuffer.length} bytes from s3://${s3Bucket}/${s3Key}`);
  } catch (s3Err: any) {
    // If S3 fails or is unconfigured in local test, check for mock buffer or rethrow for backoff retry
    throw new Error(`S3 Download Failed for key '${s3Key}': ${s3Err.message}`);
  }

  // Step 3: Extract & sanitize text from PDF
  const { text: parsedText, numPages } = await parsePdfBuffer(pdfBuffer);
  console.log(`[Worker] Parsed ${parsedText.length} characters across ${numPages} page(s) from ${fileName}`);

  // Step 4: Generate vector embedding
  const embedding = await generateTextEmbedding(parsedText);
  console.log(`[Worker] Generated ${embedding.length}-dimensional vector embedding`);

  // Step 5: Persist results in Supabase
  const vecString = `[${embedding.join(',')}]`;
  const { error: updateError } = await supabase
    .from('resumes')
    .update({
      parsed_text: parsedText,
      embedding: vecString as any,
      status: 'completed',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resumeId);

  if (updateError) {
    throw new Error(`Supabase DB update failed for resume ${resumeId}: ${updateError.message}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Worker] Successfully completed resume ${resumeId} in ${durationMs}ms`);

  return {
    success: true,
    resumeId,
    textLength: parsedText.length,
    embeddingDimensions: embedding.length,
    pages: numPages,
    durationMs,
  };
}
