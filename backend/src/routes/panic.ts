import { Router, Response } from 'express';
import { panicSwitch } from '../services/migration.service';
import { logAction } from '../services/log.service';
import { notifyPanic } from '../services/telegram.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// POST /api/panic - execute panic switch
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await panicSwitch(req.user!.id);

    await logAction({
      userId: req.user!.id,
      action: 'panic_switch',
      target: `Переключено: ${result.switched}`,
      details: { errors: result.errors },
      ip: req.ip || '',
    });

    // Send Telegram notification
    await notifyPanic(result.switched).catch(() => {});

    res.json(result);
  } catch (error) {
    console.error('Panic switch error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
