import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Global API Rate Limiter
 * 
 * Non-obvious / Interview Talking Point:
 * Why tiered rate limiting?
 * - Protects API resources from denial-of-service (DoS) and automated scrapers.
 * - Standard endpoints receive a generous window (100 requests / 15 min), while
 *   computationally or storage-expensive endpoints (pre-signed upload URLs)
 *   are locked down to stricter thresholds (10 requests / 15 min).
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP address. Please try again later.',
    retryAfterSeconds: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
  },
});

/**
 * Strict Rate Limiter for Resume Upload URL Generation
 * Prevents malicious users from rapidly generating presigned URLs or flooding S3.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.UPLOAD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // If authenticated, rate limit per user ID; otherwise fallback to IP
    return req.user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Upload request limit exceeded. You can only request 10 resume uploads per 15 minutes.',
    retryAfterSeconds: 900,
  },
});
