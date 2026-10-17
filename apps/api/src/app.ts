import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

// Route handlers
import healthRouter from './routes/health';
import jobsRouter from './routes/jobs';
import resumesRouter from './routes/resumes';
import authRouter from './routes/auth';
import matchesRouter from './routes/matches';

export function createApp(): Express {
  const app = express();

  // Security HTTP headers
  app.use(helmet());

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Body parser
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Global API Rate Limiter
  app.use('/api', apiRateLimiter);

  // Mount API modules
  app.use('/api/health', healthRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/matches', matchesRouter);

  // 404 Not Found Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested API route does not exist',
    });
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
