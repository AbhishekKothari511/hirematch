import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

/**
 * AWS S3 Storage Service for Candidate Resumes
 *
 * Non-obvious / Interview Talking Point:
 * Why Pre-Signed S3 URLs over Express Server Streaming?
 * 1. Unblocked Event Loop: Streaming 10MB PDF buffers through Node.js consumes significant
 *    RAM and blocks worker threads on network socket I/O. Pre-signed URLs offload the
 *    entire byte-transfer throughput directly to AWS S3's globally distributed endpoints.
 * 2. Bandwidth & Cost Savings: Prevents double-hop egress bandwidth fees (Client -> EC2 -> S3).
 * 3. Least Privilege & Private Bucket: The bucket blocks all public ACLs. The client only
 *    obtains a time-limited (15-minute) signature for the exact target key.
 */
class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private expirationSeconds: number;

  constructor() {
    this.bucket = env.S3_BUCKET_NAME;
    this.expirationSeconds = env.S3_SIGNED_URL_EXPIRATION_SECONDS;

    this.client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Generates a pre-signed PUT URL allowing a student to upload their resume directly to S3.
   */
  async generateSignedUploadUrl(
    userId: string,
    fileName: string,
    mimeType: string,
    fileSizeBytes: number
  ): Promise<{ uploadUrl: string; s3Key: string; s3Bucket: string; expiresInSeconds: number }> {
    // Sanitize file name to prevent directory traversal or invalid characters
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `resumes/${userId}/${Date.now()}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
      ContentLength: fileSizeBytes,
      Metadata: {
        'user-id': userId,
        'original-filename': encodeURIComponent(fileName),
      },
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.expirationSeconds,
    });

    return {
      uploadUrl,
      s3Key,
      s3Bucket: this.bucket,
      expiresInSeconds: this.expirationSeconds,
    };
  }

  /**
   * Generates a temporary pre-signed GET URL for authenticated download/viewing of a resume.
   */
  async generateSignedDownloadUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: this.expirationSeconds,
    });
  }

  /**
   * Permanently deletes a resume file from S3 (Delete-My-Data / GDPR compliance).
   */
  async deleteFile(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    await this.client.send(command);
  }

  /**
   * Verifies that the uploaded object exists and returns its size.
   */
  async verifyObjectExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

export const s3Service = new S3StorageService();
