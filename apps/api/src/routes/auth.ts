import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSupabaseClient } from '../services/supabaseService';

const router = Router();

/**
 * GET /api/auth/me
 * Returns current authenticated user session details and profile
 */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabaseClient(req.token);

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, full_name, avatar_url, role, created_at')
      .eq('id', req.user!.id)
      .single();

    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

export default router;
