import { Router, Request, Response } from 'express';
import { getServiceRoleClient } from '../services/supabaseService';

const router = Router();

/**
 * Health Check Endpoint: GET /api/health
 * 
 * Reports service uptime, process memory, active environment,
 * and downstream PostgreSQL database ping status.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  let dbStatus = 'unreachable';
  let dbLatencyMs = -1;

  try {
    const supabase = getServiceRoleClient();
    const dbStart = Date.now();
    const { error } = await supabase.from('jobs').select('id').limit(1);
    dbLatencyMs = Date.now() - dbStart;

    if (!error) {
      dbStatus = 'connected';
    } else {
      dbStatus = `degraded: ${error.message}`;
    }
  } catch (err: any) {
    dbStatus = `error: ${err.message || 'connection failed'}`;
  }

  const memoryUsage = process.memoryUsage();

  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
    },
  });
});

export default router;
