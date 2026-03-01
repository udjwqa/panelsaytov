import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logAction } from '../services/log.service';
import { addManualBackupJob, setupBackupSchedule } from '../services/backup-scheduler.service';
import { restoreBackup, getBackupSettings, updateBackupSettings } from '../services/backup.service';
import fs from 'fs/promises';

function paramId(req: AuthRequest): string {
  return String(req.params.id);
}

const router = Router();
router.use(authMiddleware);

// GET /api/backups - list backups with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const siteId = req.query.siteId as string | undefined;

    const where = siteId ? { siteId } : {};

    const [backups, total] = await Promise.all([
      prisma.backup.findMany({
        where,
        include: {
          site: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backup.count({ where }),
    ]);

    // Convert BigInt fileSize to string for JSON serialization
    const serialized = backups.map((b) => ({
      ...b,
      fileSize: b.fileSize ? b.fileSize.toString() : null,
    }));

    res.json({
      backups: serialized,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get backups error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/backups/settings - get backup settings
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getBackupSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Get backup settings error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/backups/settings - update backup settings
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, cronTime, retentionDays, maxPerSite } = req.body;
    await updateBackupSettings({ enabled, cronTime, retentionDays, maxPerSite });

    // Reschedule
    await setupBackupSchedule();

    await logAction({
      userId: req.user!.id,
      action: 'backup_settings_update',
      target: 'backup_settings',
      ip: req.ip || '',
    });

    const settings = await getBackupSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Update backup settings error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/backups/:id - get backup detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const backup = await prisma.backup.findUnique({
      where: { id: paramId(req) },
      include: {
        site: { select: { id: true, name: true } },
      },
    });

    if (!backup) {
      res.status(404).json({ error: 'Бэкап не найден' });
      return;
    }

    res.json({
      backup: {
        ...backup,
        fileSize: backup.fileSize ? backup.fileSize.toString() : null,
      },
    });
  } catch (error) {
    console.error('Get backup error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/backups - create manual backup
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.body;

    if (!siteId) {
      res.status(400).json({ error: 'siteId обязателен' });
      return;
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, serverId: true },
    });

    if (!site) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    // Check for active backup on this site
    const activeBackup = await prisma.backup.findFirst({
      where: { siteId, status: { in: ['PENDING', 'RUNNING'] } },
    });

    if (activeBackup) {
      res.status(400).json({ error: 'Бэкап уже выполняется для этого сайта' });
      return;
    }

    const backup = await prisma.backup.create({
      data: {
        siteId,
        serverId: site.serverId,
        type: 'MANUAL',
        status: 'PENDING',
      },
      include: {
        site: { select: { id: true, name: true } },
      },
    });

    // Add to queue
    await addManualBackupJob(backup.id);

    await logAction({
      userId: req.user!.id,
      siteId,
      action: 'backup_create',
      target: site.name,
      ip: req.ip || '',
    });

    res.status(201).json({
      backup: {
        ...backup,
        fileSize: backup.fileSize ? backup.fileSize.toString() : null,
      },
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/backups/:id/restore - restore backup
router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    const backupId = paramId(req);
    const { targetServerId } = req.body;

    const backup = await prisma.backup.findUnique({
      where: { id: backupId },
      include: { site: { select: { id: true, name: true } } },
    });

    if (!backup) {
      res.status(404).json({ error: 'Бэкап не найден' });
      return;
    }

    if (backup.status !== 'SUCCESS') {
      res.status(400).json({ error: 'Можно восстановить только успешный бэкап' });
      return;
    }

    await restoreBackup(backupId, targetServerId);

    await logAction({
      userId: req.user!.id,
      siteId: backup.siteId,
      action: 'backup_restore',
      target: (backup.site as any).name,
      details: targetServerId ? { targetServerId } : undefined,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Restore backup error:', error);
    res.status(500).json({ error: error.message || 'Ошибка восстановления' });
  }
});

// DELETE /api/backups/:id - delete backup
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const backup = await prisma.backup.findUnique({
      where: { id: paramId(req) },
      include: { site: { select: { id: true, name: true } } },
    });

    if (!backup) {
      res.status(404).json({ error: 'Бэкап не найден' });
      return;
    }

    // Delete file if exists
    if (backup.filePath) {
      try {
        await fs.unlink(backup.filePath);
      } catch {
        // File may already be deleted
      }
    }

    await prisma.backup.delete({ where: { id: backup.id } });

    await logAction({
      userId: req.user!.id,
      siteId: backup.siteId,
      action: 'backup_delete',
      target: (backup.site as any).name,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
